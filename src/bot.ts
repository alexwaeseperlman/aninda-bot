import * as Discord from 'discord.js';
import TimerDB, { EventType, PairsQuery, TimerEvent } from './db.bot';
import * as winston from 'winston';
import { getLogger } from './util';
import * as chalk from 'chalk';

const dateSizes: {[k: string]: [number, number]} = { s: [1000, 60], m: [60000, 60], h: [60000 * 60, 24], d: [1000 * 3600 * 24, 30], M: [1000 * 3600 * 24 * 30, 12], y: [1000 * 3600 * 24 * 30 * 12, Infinity] }

function msToReadable(ms: number): string {
	const order = 'yMdhms';

	let out = '';
	let end = order.length;

	for (let i = 0; i < end && i < order.length; i++) {
		const amount = Math.floor(ms / dateSizes[order[i]][0]) % dateSizes[order[i]][1];
		if (amount > 0) {
			if (end == order.length) end = i + 3;
			out += amount + order[i] + ' ';
		}

	}
	return out;
}

interface CommandData {
	// The tokenized command split by spaces
	command: string[];

	// A list of people that the command mentions
	targets: ({ id: string, [key: string]: any })[]
	sender: Discord.User;

	channel: Discord.TextChannel | Discord.DMChannel | Discord.NewsChannel;
	guild: Discord.Guild | null;
}

export default class TimerBot {
	client: Discord.Client;
	db: TimerDB;

	commands: { [key: string]: (msg: CommandData) => Promise<boolean> } = ({
		"top": async (msg: CommandData) => {
			return await this.queryTop(msg);
		},
		"with": async (msg: CommandData) => {
			return await this.queryTop(msg, (query: PairsQuery) => {
				if (Array.isArray(query.userID)) query.userMask = query.userID;
				return query;
			});
		},
		"me": async (msg: CommandData) => {
			msg.targets.unshift(msg.sender);
			return await this.commands.top(msg);
		},
		"help": async (msg: CommandData) => {
			msg.channel.send(`Use '.pairs me' to get your top pairs, or '.pairs top' to get this server's top pairs`);
			return true;
		}
	})

	constructor(private token: string, 
				private commandPrefix: string = '.pairs', 
				dbAddress: string = "localhost:27017",
				private logger: winston.Logger = getLogger("Discord", chalk.blue)) {
		this.client = new Discord.Client();
		this.db = new TimerDB(dbAddress);
	}

	start() {
		this.registerListeners();
		this.client.login(this.token);
	}

	registerListeners(): void {
		this.client.on('ready', async () => {
			this.logger.info(`${this.client.user?.username} connected to API`);
			await this.db.verifyEvents(this);
		});

		this.client.on('error', (error) => {
			this.logger.error(error);
		});

		this.client.on('warn', warning => {
			this.logger.warn(warning);
		});

		this.client.on('guildCreate', guild => {
			this.updateEventState(guild.id);
		});
		
		this.client.on('message', (msg: Discord.Message) => {
			this.logger.silly(`Received message on guild ${msg.guild} from ${msg.member} with content '${msg.content}'`);
			const command = this.parseMessage(msg);
		});
		this.client.on('voiceStateUpdate', (oldState: Discord.VoiceState, newState: Discord.VoiceState) => {
			this.voiceStateUpdate(oldState, newState)
		})
	}

	/**
	 * Logs useful info
	 * */
	async logDump(): Promise<void> {

	}

	/**
	 * Get useful information out of a command and run it
	 * */
	async parseMessage(msg: Discord.Message): Promise<boolean> {
		const c = msg.content.split(' ');
		// Check if the message is a command
		if (c[0] == this.commandPrefix && c[1]) {
			this.logger.debug(`Received command with content ${msg.content} from ${msg.member?.nickname} on guild ${msg.guild}`);
			
			this.logger.debug(`Running ${c[1]}`);

			const command = {
				sender: msg.author,
				channel: msg.channel,
				targets: msg.mentions.members?.map(v => v) ?? [],
				command: c,
				guild: msg.guild
			}
			
			if (command.command[1] in this.commands) return await this.commands[command.command[1]](command);
			else {
				msg.channel.send(`'${msg.content}' is not a command. Try ${this.commandPrefix} help for more information`);
				return false
			}
		}
		return false
	}

	/**
	 * Gets the current state of every user the server has access to and emits an event for it
	 *
	 * @param guildID - If given the only the events on this guild will be updated
	 *
	 * TODO: This is not very scalable because it spams the database with queries
	 * */
	async updateEventState(guildID?: string) {
		this.logger.info('Updating events table based on current connections');
		await Promise.all(this.client.guilds.cache.map(async (guild, key) => {
			if (guildID && guildID != key) return;
			await Promise.all(guild.channels.cache.map(async (channel, key) => {
				//if (channel.name == 'subatsanimeshit' && channel.isText()) channel.send("what the fuck");
				if (channel.type != 'voice') return;
				await Promise.all(channel.members.map(async (member, key) => {
					this.logger.debug(`In ${guild.name}/${channel.name} with ${member.nickname}`);
					await this.voiceStateUpdate(member.voice);
				}));
			}));
		}));
		this.logger.debug('Done updating events');
		
	}

	async voiceStateUpdate(oldState: Discord.VoiceState, newState?: Discord.VoiceState) {
		if (!oldState.member) throw new Error('No member on voice state update');
		const events: EventType[] = ['mute', 'deaf', 'streaming'];
		const event  = {
			guildID: newState?.guild?.id ?? oldState.guild?.id,
			time: Date.now(),
			userID: newState?.member?.id ?? oldState?.member?.id,
			channelID: newState?.channel?.id ?? oldState.channel?.id,
			needsVerification: false,
			createdAt: new Date(),
			endTime: 9007199254740991 as (9007199254740991)
		}
		if (!newState || newState.channelID != oldState.channelID) {
			if (newState && newState.channelID != oldState.channelID) {
				await this.db.storeEvent({
					...event,
					channelID: oldState.channel?.id,
					guildID: oldState.guild?.id,
					type: 'connect',
					value: false,
				});
				if (newState.channelID == null) {
					for (let e of events) {
						await this.db.storeEvent({
							...event,
							type: e as EventType,
							value: false
						});
					}
				}

			}
			if ((newState ?? oldState).channelID) {
				await this.db.storeEvent({
					...event,
					type: 'connect',
					value: true
				});
			}
			
		}

		for (let name of events as (keyof Discord.VoiceState)[]) {
			if (!newState || oldState[name] !== newState[name]) {
				await this.db.storeEvent({
					...event,
					type: name as EventType,
					value: !!((newState ?? oldState)[name])
				});
			}
		}
	}

	// TODO: allow people to send a minimum and maximum time for queries
	static parseTimeInput(command: string): number {
		const regex = /(\d+[a-zA-Z])/g;
		const matches = command.match(regex);
		if (!matches) throw new Error('Invalid time input');
		
		let timeValue = Date.now();
		matches.forEach((match: string) => {
			const unit = match[match.length - 1];
			if (!(unit in dateSizes)) throw new Error('Invalid date unit');
			const value = parseInt(match);
			if (isNaN(value)) throw new Error('Invalid value for date unit');
			timeValue -= value * dateSizes[unit][0];
		});

		return timeValue;
	}

	static getTimeInput(msg: CommandData): number {
		for (let i = 0; i < msg.command.length; i++) {
			if (msg.command[i] == '-t' || msg.command[i] == '--time') {
				try {
					return TimerBot.parseTimeInput(msg.command[i + 1]);
				}
				catch (err) {
					msg.channel.send(err.message + '. It should look like this: 1M15d7h10m5s');
					return 0;
				}
			}
		}
		return 0;
	}

	static getCountInput(msg: CommandData): number {
		for (let i = 0; i < msg.command.length; i++) {
			if (msg.command[i] == '-c' || msg.command[i] == '--count') {
				return parseInt(msg.command[i + 1]) || 5;
			}
		}
		return 5;
	}

	async queryTop(msg: CommandData, queryModifier: (query: PairsQuery) => PairsQuery = o => o): Promise<boolean> {
			this.logger.debug(`'top' command contains: ${msg.command.join(', ')}`);
			const startTime = TimerBot.getTimeInput(msg);
			const count = TimerBot.getCountInput(msg);
			const targets = msg.targets.map((u) => u.id);

			const times = await this.db.topTimes(queryModifier({ count, userID: targets.length == 1 ? (targets[0]) : (targets.length == 0 ? undefined : targets), startTime }));
			const out = new Discord.MessageEmbed()
					.setColor('#da004e')
					.setTitle(startTime == 0 ? `Top pairs for all time` : `Top pairs for the past ${msToReadable(Date.now() - startTime)}`)
					.addFields(times.map((time) => {
						return { name: msToReadable(time.time), value: `<@${time._id.id}> with <@${time._id.with}>`}
					}))
					.setTimestamp();
			this.logger.verbose(`Sending pairs data to ${msg.guild?.id} for ${msg.sender?.id}`);
			msg.channel.send(out);
			return true;
		}
}
