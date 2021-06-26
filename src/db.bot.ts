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

export interface TimerEventStart {
	type: EventType;
	userID: string;
	channelID: string;
	guildID: string;
}

export interface TimerEventEnd {
	type: EventType;
	userID: string;
}
export interface Times {
	type: EventType;
	time: number;
	userID: string;
	channelID: string;
	guildID: string;
	needsVerification: boolean;
	endTime: number;
	createdAt?: Date;
}

export interface TimeSum {
	start: number;
	end: number;
	userID: string;
	withID: string;
	channelID: string;
	guildID: string;

	totalTime: number;

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
		this.times.createIndex({ "endTime": 1 });
		
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

	async startEvent(event: TimerEventStart) {
		if (typeof event.channelID != 'string') {
			this.logger.error(`No channel id on ${JSON.stringify(event)}`);
			return;
		}
		// Ensure this event isn't a duplicate
		const runningEvents = await this.times.find({ type: event.type, userID: event.userID, needsVerification: false, endTime: Number.MAX_SAFE_INTEGER });
		if (runningEvents.length) {
			this.logger.error(`There is already a `);
		}

		this.logger.debug(`Received voice event start of type ${event.type} from ${event.userID}`);
		// If there are events that are waiting to be verified (for example if the bot has just started up) then use their start time instead.
		const waitingVerificationUpdate = await this.times.update({ ...event, createdAt: { $ne: undefined }, time: { $gt: 0 }, needsVerification: true }, { $set: { needsVerification: false } });
		this.logger.debug(JSON.stringify({ waitingVerificationUpdate }));
		// Don't insert a new event if some events were verified
		if ((waitingVerificationUpdate as any).nModified == 0) {
			// Insert the event, cast as a time. `channelID` in `TimerEvent` is string | undefined, but `channelID` in `Times` is string. 
			// There is a type guard at the start of the function but it is not detected
			await this.times.insert({ ...event, createdAt: new Date(), endTime: Number.MAX_SAFE_INTEGER, time: Date.now(), needsVerification: false } as Times);
		}
		return;
	}

	async endEvent(event: TimerEventEnd) {
		this.logger.debug(`Received voice event end of type ${event.type} from ${event.userID}`);
		// If there are multiple events of the same type in the database, time from the last one
		const previous = await (this.times.find({
			type: event.type,
			userID: event.userID,
			endTime: Number.MAX_SAFE_INTEGER
		}, { limit: 1, sort: { time: 1 }}));
		if (previous.length) {
			// Remove the in progress event and replace it with a new one
			const removed = await this.times.remove({
				...event,
				endTime: Number.MAX_SAFE_INTEGER
			});
			this.logger.debug(`Removed ${removed} active events`);
			const time: Times = {
				needsVerification: false,
				type: previous[0].type,
				time: previous[0].time,
				endTime: Date.now(),
				userID: previous[0].userID,
				guildID: previous[0].guildID,
				channelID: previous[0].channelID
			}
			await this.times.insert({
				...time
			});

			// Update the prefix sum database by counting the amount of time spent with people in the current call

			

			this.logger.verbose(`Ending ${event.type} event that lasted for ${Date.now() - previous[0].time}ms`);
		}
		else {
			this.logger.verbose(`Tried to remove ${event.type} event for ${event.userID} but instead did nothing because event begin isn't in database`);
		}
	}


	async verify(event: Times, bot: TimerBot): Promise<boolean> {
		const state = await bot.getEventState(event.channelID, event.userID, event.type);
		console.log('verifying', event);

		if (state) {
			await this.times.findOneAndUpdate({ 
					time: event.time, 
					endTime: event.endTime, 
					userID: event.userID, 
					channelID: event.channelID, 
					type: event.type 
				}, { 
					$set: { 
						needsVerification: false 
					} 
				});
		}

		return state;
	}

	// Uses a discord connection to ensure that every event in the database is actually occurring
	async verifyEvents(bot: TimerBot) {
		const unknown = await this.times.find({ needsVerification: true });

		for (let event of unknown) {
			await this.verify(event, bot);
			
		}

		this.logger.info(`Removed ${(await this.times.remove({ needsVerification: true })).deletedCount} expired events`);
	}

	async verifyAll() {
		await this.times.update({ endTime: Number.MAX_SAFE_INTEGER }, { $set: { needsVerification: true } }, { multi: true });
	}
	
	async top(query: PairsQuery): Promise<TopTimes[]> {
		query.endTime = Date.now();
		const events = this.queries['pairs'](query);

		const result = await this.times.aggregate(events);
		this.logger.debug(`Aggregate result ${JSON.stringify(result)}`);
		return result;
	}
	
	async topPairs(query: PairsQuery): Promise<TopTimes[]> {
		return await this.top({ ...query, noSelf: true });
	}

	async topUsage(query: PairsQuery): Promise<TopTimes[]> {
		return await this.top({ ...query, onlySelf: true });
	}
	
	// Logs useful information
	async logDump() {
		this.logger.info(`Open connections: ${await this.times.count({ endTime: Number.MAX_SAFE_INTEGER })}`);
		this.logger.info(`Times database: ${await this.times.count({})} records`);
		const connections = await this.times.find({ endTime: Number.MAX_SAFE_INTEGER });

		for (let i of connections) {
			this.logger.debug(JSON.stringify(i));
		}
	}
}
