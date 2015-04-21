# ES console
A test console for elasticsearch.


## SETUP

1. Download and install Node.js;
2. Clone this repository;
3. Run the app.js script using "node app.js" (it's going to run on port 3000);
4. http://localhost:3000 is going to show the console.


## HOW TO USE
The console has several parameters:

- Index, which determines the name of the index that needs to be created;
- Type, which determines the type of data stored in the index;
- Node number, which determines the number of nodes which are going to be run;
- Primary shards, which determines the number of primary shards which are going to be used;
- Replica shards, which determines the numbe of replica shards used FOR EACH PRIMARY SHARD;
- Content path, which determines the path of the .txt file which is going to be fed into the Elasticsearch database.

##WARNING 
The number of shards is static, that is, it can only be set when the index has been created. Once the index has been created, the number of primary or replica shards cannot be changed.




