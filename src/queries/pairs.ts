import eventTimes, {EventTimeQuery} from './event-times';
export default ({
	guildID,
	channelID,
	userID,
	startTime,
	endTime,
	count,
	userMask,
	noSelf,
	onlySelf
}: PairsQuery) => {
	const timesMatch = eventTimes({ startTime, endTime, userID, channelID, guildID, event: 'connect' });
	const lookupMatch: any = { '$match': { 'type': 'connect', '$expr': { '$and': [ { '$gte': [ '$endTime', '$$startTime' ] }, { '$lte': [ '$time', '$$endTime' ]}, { '$eq': [ '$channelID', '$$channelID' ] } ] } } };
	if (noSelf) lookupMatch.$match.$expr.$and.push({ '$ne': [ '$userID', '$$userID' ] });
	if (onlySelf) lookupMatch.$match.$expr.$and.push({ '$eq': [ '$userID', '$$userID' ] });
	if (userMask) lookupMatch.$match.$expr.$and.push({ '$in': [ '$userID', userMask ] });
	const query = [
		...timesMatch, 
		// Lookup and store the amount of time spent with each other user while the target users are in call
		{ '$lookup': { 'from': 'times', 'let': { 'startTime': '$time', 'endTime': '$endTime', 'channelID': '$channelID', 'userID': '$userID' }, 'pipeline': [ lookupMatch, { '$project': { 'userID': 1, 'together': { '$subtract': [ { '$min': [ '$endTime', '$$endTime' ] }, { '$max': [ '$time', '$$startTime' ] } ] } } }, { '$group': { 'time': { '$sum': '$together' }, '_id': '$userID' } } ], 'as': 'timeWith' } }, 
		// Split those times up into their own records, each one representing the time any person A spent with any person B in a single session
		{ '$unwind': { 'path': '$timeWith' } },
		// Get the necessary information out of those records
		{ '$project': { 'userID': 1, 'with': '$timeWith._id', 'time': '$timeWith.time' } }, 
		// Sum each pairs time up to get the total amount of time
		{ '$group': { 'time': { '$sum': '$time' }, '_id': { 'id': '$userID', 'with': '$with' } } },
		// Sort the ids of the two users so that the order they appear in is always the same, then use that to make sure that there are no duplicates
		// For example ensure that (Person A-Person B) is the same as (Person B-Person A)
		{ '$group': { '_id': { 'id': { '$min': ['$_id.id', '$_id.with'] }, 'with': { '$max': ['$_id.id', '$_id.with'] } }, 'time': { '$avg': '$time' }, 'reps': { '$sum': 1 } } }, 
		// Sort by length in call
		{ '$sort': { 'time': -1 } }
	]
		// Apply the limit
	if (count) query.push({ '$limit': count }); 
	return query;
}

export interface PairsQuery extends EventTimeQuery {
	count?: number;
	event?: 'connect';
	userMask?: string[];
	noSelf?: boolean;
	onlySelf?: boolean;
}
