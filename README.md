# Readme
## What is this? 
Aninda-bot is a Discord bot that times the amount of time people spend together in call. 

## How does it work?
Every time a user starts performing one of the tracked actions (e.g. by muting themself or joining a call) an entry with the start time is put into the database. When they finish the action (e.g. by unmuting/leaving) that entry is updated with the end time. The time each user spends together is calculated any time the bot is queried. 

Calculating times as needed will probably lead to issues in the future as the database grows because a command like `top` is O(n^2) for the size of the database. I can think of a few ways to optimize this but it probably won't be necessary for a long time. 


## Usage
The bot currently has three commands implemented.
### With
Usage:
```
<prefix> with @User1 @User2 --count 5 --time 1M5d
```
This command gives you the top pairs out of every possible pairing of the mentioned users. 

### Top
Usage:
```
<prefix> top @User1 --count 5 --time 2d1h
```
This command gives you the top pairs for the mentioned users with everyone in the database. If no one is mentioned it will give you the overall, global, top pairs

### Me
Usage:
```
<prefix> me --count 5 --time 2h15m
```

This is simply an alias for calling `<prefix> top` and mentioning yourself.



## Setup
The bot uses environment variables `API_KEY` and `MONGO_CONNECTION` to connect to the discord api and it's database. Simply run 
```
npm build
npm start
```
In an environment with these variables set and it will run. 

