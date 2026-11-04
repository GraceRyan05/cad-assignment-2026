import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { actorKey, ddb, movieKey, type Role, tableName, toRole } from "../shared/db";
import { isResponse, parseJsonObject, response } from "../shared/http";
import { logRequest } from "../shared/request-logger";
import Ajv from "ajv";
import schema from "../shared/types.schema.json";
import type { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { parseId } from "../shared/db";

const ajv = new Ajv();
const roleSchema = (schema.definitions as Record<string, object>)["Role"];
const isValidRolePayload = ajv.compile<Role>(roleSchema || {});


export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  logRequest(event);
  const body = parseJsonObject(event);
  if (isResponse(body)) return body;

  if(!isValidRolePayload(body)) {
    return response(400, {
      message: "Incorrect type. Must match the role schema",
      schema: roleSchema,
    });
  }

  if (parseId(String(body.movieId)) === undefined || parseId(String(body.actorId)) === undefined) {
    return response(400, {message: "movieId and actorId must be positive integers"});
  }
  const role = toRole(body);

  try {
    
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
          ConditionCheck: {
            TableName: tableName,
            Key: { PK: movieKey(role.movieId), SK: movieKey(role.movieId)},
            ConditionExpression: "attribute_exists(PK)",
          },
        },
        {
          ConditionCheck: {
            TableName: tableName,
            Key: { PK: actorKey(role.actorId), SK: actorKey(role.actorId)},
            ConditionExpression: "attribute_exists(PK)",
          }
        },
        {
          Put: {
            TableName: tableName,
            Item: { PK: movieKey(role.movieId), SK: actorKey(role.actorId), ...role},
            ConditionExpression: "attribute_not_exists(PK)",
          },
        },
        ],
      })
    );
    return response(201, { message: "Role added", data: role });
  } catch (err) {
    if ((err as Error).name === "TransactionCancelledException") {
      const reasons = (err as TransactionCanceledException).CancellationReasons ??
      [];
      if (reasons[0]?.Code === "ConditionCheckFailed") {
        return response(404, { message: `Movie ${role.movieId} not found`});
      }
      if (reasons[1]?.Code === "ConditionCheckFailed") {
        return response(404, {message: `Actor ${role.actorId} not found`});
      }
      if (reasons[2]?.Code === "ConditionalCheckFailed") {
        return response(409, {
          message: `Actor ${role.actorId} already has a role in movie ${role.movieId}`,
        });
      }
    }
    console.error("DynamoDB error:", err);
    return response(500, {
      message: "Internal server error"
    });
  }
};
