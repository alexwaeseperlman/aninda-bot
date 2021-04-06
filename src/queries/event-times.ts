export default ({ 
	startTime, 
	endTime, 
	userID, 
	channelID, 
	guildID,
	event
}: EventTimeQuery) => {
	const query: object[] = [
		{ $match: { 
			endTime: startTime ? { $gt: startTime } : { $ne: null }, 
			guildID: Array.isArray(guildID) ? { $in: guildID } : (guildID ?? { $ne: null }),
			channelID: Array.isArray(channelID) ? { $in: channelID } : (channelID ?? { $ne: null }),
			time: endTime ? { $lt: endTime } : { $ne: null }, 
			userID: Array.isArray(userID) ? { $in: userID } : (userID ?? { $ne: null }),
			type: event ?? 'connect'
		} }
	]

	if (startTime || endTime) {
		query.push({ $addFields: { 
			endTime: { $min: [ '$endTime', endTime ] },
			time: { $max: [ '$time', startTime ] }
		} });
	}
	return query;
}
export interface EventTimeQuery {
	startTime?: number; 
	endTime?: number; 
	userID?: string[] | string;
	channelID?: string[] | string; 
	guildID?: string[] | string;
	event?: string;
}
