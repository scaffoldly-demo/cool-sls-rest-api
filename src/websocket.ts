import {
  authorizeToken,
  BaseJwtPayload,
  extractUserId,
  AWS,
  STAGE,
} from '@scaffoldly/serverless-util';
import { APIGatewayProxyResultV2 } from 'aws-lambda';
import { env } from './env';

const connections: { [key: string]: BaseJwtPayload } = {};

export class WebsocketHelper {
  api: AWS.ApiGatewayManagementApi;

  constructor(public readonly connectionId: string) {
    let options;
    if (STAGE === 'local') {
      options = {
        endpoint: 'http://localhost:3001',
      };
    } else {
      options = {
        endpoint: `https://${env['api-gateway-websocket-domain']}/${env['service-slug']}`,
      };
    }
    console.log('API Gateway Management API Options: ', options);
    this.api = new AWS.ApiGatewayManagementApi(options);
  }

  sendMessage = async (data: unknown): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      console.log('Posting to connection:', this.connectionId);
      this.api.postToConnection(
        { ConnectionId: this.connectionId, Data: JSON.stringify(data) },
        (error: AWS.AWSError) => {
          if (error) {
            console.error('Error posting to connection');
            reject(error);
          } else {
            resolve();
          }
        },
      );
    });
  };

  close = (): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      console.log('Closing connection:', this.connectionId);
      this.api.deleteConnection({ ConnectionId: this.connectionId }, (err: AWS.AWSError) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  };
}

export const handler = async (
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  event: any,
  context: unknown,
): Promise<APIGatewayProxyResultV2> => {
  console.log('Event:', event);
  console.log('Context:', context);

  const { requestContext } = event;
  const { routeKey, connectionId } = requestContext;

  switch (routeKey) {
    case '$connect': {
      console.log(`Connected! Connection ID is ${connectionId}`);

      const token = (event.queryStringParameters && event.queryStringParameters.token) || undefined;
      if (!token) {
        console.error('Missing token');
        return { statusCode: 401 };
      }

      let payload: BaseJwtPayload;
      try {
        payload = await authorizeToken({ token });
      } catch (e) {
        if (e instanceof Error) {
          console.error('Error authorizing token', e.message);
          return { statusCode: 401 };
        }
        throw e;
      }

      // DEVNOTE: API Gateway connections keepalive for 10 minutes

      // TODO: Save the connection ID + identity in the database, it would also be prudent to set the `expires` column so the table cleans itself up
      // For now, just saving them in memory which will persist in Lambda runtine memory for 5 minutes
      // Note: this technique does not work locally and you'll need to save the mapping to a DB somewhere
      connections[connectionId] = payload;

      const userId = extractUserId(payload);
      console.log('Connected user:', userId);

      // Lambda does not support sending a response as part of the connect, so let's send one asynchronously...
      const helper = new WebsocketHelper(connectionId);
      helper.sendMessage({ userId, message: `Hello ${userId}!!` });

      return { statusCode: 200 };
    }

    case '$disconnect': {
      // TODO: Delete the connection ID from the database
      console.log(`Disconnected! Connection ID was ${connectionId}`);
      return { statusCode: 200 };
    }

    case '$default': {
      console.log(`Message Received! Connection ID is ${connectionId}`);

      const payload = connections[connectionId];
      if (!payload) {
        console.error(`Unable to find payload for connection ID: ${connectionId}`);
        return {
          statusCode: 403,
          body: JSON.stringify({ errorMessage: 'Unknown connection ID. Please reconnect.' }),
        };
      }

      const userId = extractUserId(payload);
      const { body } = event;

      // DEVNOTE: Probably send stringify'd JSON and use JSON.parse(body) here
      console.log(`Message from ${userId}: ${body}`);

      // Echobot!
      return {
        statusCode: 200,
        body: JSON.stringify({
          userId,
          message: `Echobot: Got your message: ${body}`,
        }),
      };
    }

    default: {
      return { statusCode: 400 };
    }
  }
};
