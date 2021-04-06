# Readme
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

