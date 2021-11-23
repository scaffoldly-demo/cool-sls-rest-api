import { APIGatewayProxyResultV2 } from 'aws-lambda';

export const handler = async (
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  event: any,
  context: unknown,
): Promise<APIGatewayProxyResultV2> => {
  console.log('Event:', event);
  console.log('Context:', context);

  const { requestContext } = event;
  const { routeKey, connectionId } = requestContext;

  console.log('!!! routekey', routeKey);

  switch (routeKey) {
    case '$connect': {
      // console.log('!!! checking token');
      // const token = (event.queryStringParameters && event.queryStringParameters.token) || undefined;
      const statusCode =
        (event.queryStringParameters && event.queryStringParameters.statusCode) || 200;
      // if (!token) {
      //   console.log('!!! token not defined');
      //   return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
      // }
      // TODO For Don: Check token

      console.log(`Connected! Connection ID is ${connectionId}`);

      if (Number(statusCode) === 123) {
        throw new Error('Test error');
      }
      // DEVNOTE For Don: API Gateway connections keepalive for 10 minutes

      // TODO For Don: Save the connection ID + identity
      return { statusCode: Number(statusCode) };
    }
    case '$disconnect':
      console.log(`Disconnected! Connection ID was ${connectionId}`);
      return { statusCode: 200, body: 'Disconnected.' };
    case '$default': {
      console.log(`Message Received! Connection ID is ${connectionId}`);

      const { body } = event;
      console.log('Message body', body); // DEVNOTE: Probably send stringify'd JSON and use JSON.parse(body) here

      return JSON.stringify({ message: `I got your message: ${body}` });
    }
    default:
      return { statusCode: 200, body: JSON.stringify({ error: 'Unknown route key' }) };
  }
};
