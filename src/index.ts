import TimerBot from './bot';
import { getLogger } from './util';
import * as chalk from 'chalk';
const logger = getLogger('App', chalk.white);

let apiKey = "";

if (process.env.API_KEY) apiKey = process.env.API_KEY;
if (apiKey == "") {
	logger.error("Unable to find discord key");
	process.exit(1);
}

let mongoConnection = "";

if (process.env.MONGO_CONNECTION) mongoConnection = process.env.MONGO_CONNECTION;
if (mongoConnection == "") {
	logger.error("Unable to find mongo connection");
	process.exit(1);
}

logger.info('Credentials found');

const bot = new TimerBot(apiKey, "~pairs", mongoConnection);

bot.start();

setInterval(() => {
	logger.info('Logging status info');
	bot.logDump();
	bot.db.logDump();
}, 60000);
