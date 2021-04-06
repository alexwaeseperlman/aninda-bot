import * as Discord from 'discord.js';
import monk from 'monk';
import * as winston from 'winston';
import { getLogger } from './util';
import {ICollection, IMonkManager} from 'monk';
import * as chalk from 'chalk';
import TimerBot from './bot';
import pairs, {PairsQuery} from './queries/pairs';
import eventTimes, {EventTimeQuery} from './queries/event-times';


interface timeTogetherOptions {
	startTime: Date | undefined;
	endTime: Date | undefined;
	users: Discord.User[] | undefined;
	user: Discord.User | undefined;
	guild: Discord.Guild;
	channel: Discord.Channel;
}

export type EventType = 'connect' | 'mute' | 'deaf' | 'streaming';

export interface TimerEvent extends Times {
	endTime: 9007199254740991;
	value: boolean;
}

export interface Times {
	type: EventType;
	time: number;
	userID: string;
	channelID?: string;
	guildID: string;
	needsVerification: boolean;
	endTime: number;
	createdAt?: Date;
}

export interface TopTimes {
	_id: {
		id: string;
		with: string;
	}
	time: number;
}

export default class TimerDB {
	readonly queries = {
		"pairs": (query: PairsQuery) => {
			return pairs(query);
		}, 
		"event-times": (query: EventTimeQuery) => {

			this.logger.debug(`Making query ${JSON.stringify(query)}`);
			return eventTimes(query);
		}
	}
	private times: ICollection<Times>;
	private db: IMonkManager;

	constructor(address: string, private logger: winston.Logger = getLogger("DB", chalk.green)) {
		this.db = monk(address);
		this.registerEvents();
		this.times = this.db.get('times');
		// TODO: Add indexes to improve performance
		this.times.createIndex({ "createdAt": 1 }, { expireAfterSeconds: 3600 * 24 })
		this.times.createIndex({ "time": 1 });
		
		logger.info('Connecting to database');
	}

	registerEvents() {
		this.db.on('open', event => {
			this.logger.info(`Connected to database ${event.databaseName}`);
		});

		this.db.on('close', event => {
			this.logger.info('Closing database connection');
		});

		this.db.on('error-opening', error => {
			this.logger.error(error);
		});

	}
	
	async timeTogether(target: Discord.User, options: timeTogetherOptions) {
	}

	async storeEvent(event: TimerEvent) {
		this.logger.debug(`Received voice event of type ${event.type} ${event.value ? "begin" : "end"} from ${event.userID}`);
		if (event.value) {
			// If there are events that are waiting to be verified (for example if the bot has just started up) then use their start time instead.
			const waitingVerificationUpdate = await this.times.update({ ...event, createdAt: { $ne: undefined }, time: { $gt: 0 }, needsVerification: true }, { $set: { needsVerification: false } });
			this.logger.debug(JSON.stringify({ waitingVerificationUpdate }));
			if ((waitingVerificationUpdate as any).nModified == 0) {
				await this.times.insert({ ...event, createdAt: new Date() });
			}
			return;
		}
		else {
			// If there are multiple events of the same type in the database time from the last one
			const previous = await (this.times.find({
				type: event.type,
				userID: event.userID,
				endTime: Number.MAX_SAFE_INTEGER
			}, { limit: 1, sort: { time: 1 }}));
			if (previous.length) {
				const removed = await this.times.remove({
					type: event.type,
					userID: event.userID,
					endTime: Number.MAX_SAFE_INTEGER
				});
				const time: Times = {
					needsVerification: false,
					type: previous[0].type,
					time: previous[0].time,
					endTime: event.time,
					userID: previous[0].userID,
					guildID: previous[0].guildID,
					channelID: previous[0].channelID
				}
				await this.times.insert({
					...time
				});
				this.logger.verbose(`Ending ${event.type} event that lasted for ${Date.now() - previous[0].time}ms`);
			}
			else {
				this.logger.verbose(`Tried to remove ${event.type} event for ${event.userID} but instead did nothing because event begin isn't in database`);
			}
		}
	}

	// Uses a discord connection to ensure that every event in the database is actually occurring
	async verifyEvents(bot: TimerBot) {
		await this.times.update({ endTime: Number.MAX_SAFE_INTEGER }, { $set: { needsVerification: true } }, { multi: true })

		await bot.updateEventState();

		this.logger.info(`Removed ${(await this.times.remove({ needsVerification: true })).deletedCount} expired events`);
	}
	
	async topTimes(query: PairsQuery): Promise<TopTimes[]> {
		query.endTime = Date.now();
		const events = this.queries['pairs'](query);

		const result = await this.times.aggregate(events);
		this.logger.debug(`Aggregate result ${JSON.stringify(result)}`);
		return result;
	}
	
	// Logs useful information
	async logDump() {
		this.logger.info(`Open connections: ${await this.times.count({ endTime: Number.MAX_SAFE_INTEGER })}`);
		this.logger.info(`Times database: ${await this.times.count({})} records`);
	}
}
