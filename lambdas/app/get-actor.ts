import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import {
  actorKey,
  ddb,
  movieKey,
  parseId,
  tableName,
  toActor,
} from "../shared/db";
import { optionalIdParam, response } from "../shared/http";
import { logRequest } from "../shared/request-logger";

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  logRequest(event);

  const actorId = parseId(event.pathParameters?.actorID);
  if (actorId === undefined) {
    return response(400, { message: "actorID must be a positive integer" });
  }

  const movieId = optionalIdParam(event, "movie");
  if (typeof movieId === "object") return movieId;
  
  try {
    const actorResult = await ddb.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK: actorKey(actorId), SK: actorKey(actorId) },
      })
    );

    if (!actorResult.Item) {
      return response(404, { message: `Actor ${actorId} not found` });
    }


    const actor = toActor(actorResult.Item);
    
    if (movieId !==undefined) {
      const roleResult = await ddb.send(
        new GetCommand({
          TableName: tableName,
          Key: {PK: movieKey(movieId), SK: actorKey(actorId)},
        })
      );
      if (roleResult.Item) {
        return response(200, {
          data: {...actor, roleDescription: roleResult.Item.roleDescription},
        });
      }
      const movieResult = await ddb.send(
        new GetCommand({
          TableName: tableName,
          Key: { PK: movieKey(movieId), SK: movieKey(movieId) },
        })
      );
      if (!movieResult.Item) {
        return response(404, {message: `Movie ${movieId} not found`});
      }
    }
    return response(200, {data: actor});


  } catch (err) {
    console.error("DynamoDB error:", err);
    return response(500, { message: "Internal server error"});
  }
};
