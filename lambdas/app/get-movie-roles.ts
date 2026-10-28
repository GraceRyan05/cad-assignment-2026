//This is the lambda behind the GET /movies/{movieID}/roles

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  ddb,
  isMovieItem,
  isRoleItem,
  movieKey,
  parseId,
  tableName,
  toRole,
} from "../shared/db";
import { response } from "../shared/http";
import { logRequest } from "../shared/request-logger";

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  logRequest(event);

  const movieId = parseId(event.pathParameters?.movieID);
  if (movieId === undefined) {
    return response(400, { message: "movieID must be a positive integer" });
  }
  
  //invalid actor query parameter logic
  const actorParameter = event.queryStringParameters?.actor;
  const actorId = parseId(actorParameter);
  if (actorParameter !== undefined && actorId === undefined) {
    return response (400, { message: "Actor must be a positive integer"});
  }

  try {
    const queryResult = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": movieKey(movieId) },
      })
    );
    const items = queryResult.Items ?? [];
    if (!items.some(isMovieItem)) {
      return response(404, {message: `Movie ${movieId} not found`});
    }
    const roles = items
    .filter(isRoleItem)
    .map(toRole)
    .filter((role) => actorId === undefined || role.actorId === actorId);
    return response(200, {data: roles});
  } catch (err) {
    console.error("DynamoDB error:", err);
    return response(500, {
      message: "Internal server error",
      error: err,
    });
  }
};
