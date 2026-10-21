const serverlessExpress = require('@codegenie/serverless-express');
const app = require('./src/app');
const { checkAndNotifyDueReminders } = require('./src/services/cronScheduler');
const { setRequestId } = require('./src/utils/requestContext');

const serverlessHandler = serverlessExpress({ app });

exports.handler = async (event, context) => {
  setRequestId(context.awsRequestId);

  // Invocación por EventBridge Scheduled Rule (Cron cada 1 minuto)
  if (event.source === 'aws.events' || event['detail-type'] === 'Scheduled Event' || event.action === 'cron') {
    console.log('⏰ Invocación por EventBridge Scheduler: Verificando recordatorios pendientes...');
    try {
      const result = await checkAndNotifyDueReminders();
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Cron ejecutado con éxito', ...result })
      };
    } catch (err) {
      console.error('Error ejecutando cron en Lambda:', err);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: err.message })
      };
    }
  }

  // Invocación estándar por API Gateway
  return serverlessHandler(event, context);
};
