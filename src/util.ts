import * as winston from 'winston';
import * as chalk from 'chalk';

const { createLogger, format, transports } = winston;

export function getLogger(name: string, color: (s: string) => string) {
	name = color(name.padStart(8, ' '));
	return createLogger({
		level: 'debug',
		format: format.combine(
			format.colorize(),
			format.timestamp(),
			format.align(),
			format.prettyPrint(),
			format.printf(
				info => `${info.timestamp} ${name.padStart(8, ' ')} ${info.level}: ${info.message}`
			),
		),
		transports: [new transports.Console()]
	});
}

