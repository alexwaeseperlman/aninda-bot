import TimerBot from './bot';
import TimerDB from './db.bot'
import * as fs from 'fs';
import { getLogger } from './util';
import * as chalk from 'chalk';
const logger = getLogger('App', chalk.white);

let apiKey = "";

try {
	if (process.env.API_KEY) apiKey = process.env.API_KEY;
	apiKey = fs.readFileSync('/run/secrets/api-key').toString().replace('\n', '');
}
catch (err) {
	if (apiKey == "") {
		logger.error("Unable to find discord key");
		process.exit(1);
	}
}

let mongoConnection = "";

try {
	if (process.env.MONGO_CONNECTION) mongoConnection = process.env.MONGO_CONNECTION;
	mongoConnection = fs.readFileSync('/run/secrets/mongo-connection').toString().replace('\n', '');
}
catch (err) {
	if (mongoConnection == "") {
		logger.error("Unable to find mongo connection");
		process.exit(1);
	}
}

logger.info('Credentials found');

const bot = new TimerBot(apiKey, ".pairs", mongoConnection);

bot.start();

setInterval(() => {
	logger.info('Logging status info');
	bot.logDump();
	bot.db.logDump();
}, 60000);
