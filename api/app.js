// Load .env file into Environment Variables
require('dotenv').config();
//Require the cluster module to handle spinning new threads up
var cluster = require('cluster');
var exec = require('child_process').exec;
var servers = require('./models/server.js');
var devices = require('./models/device.js');
var cron = require('./common/cron-handler.js');
//If we are the master process, spin up new threads
if (cluster.isMaster){
  //Copy a recent copy of the .env file to the home directory to be used by the worker
  exec('cp .env ~', (err, stdout, stderr) => {
    if (err){
      console.log('Unable to update copy of .env file for the worker, exiting.');
      process.exit(1);
    }
  })
  //Connect to both databases and make sure the connection is auth'd
  if (!module.parent){
    var db = require('./common/db.js');
    //connect to the mysql database
    db.connect(function(err){
      //exit if we can't connect
      if (err){
        console.log('Unable to connect to mysql database.');
        process.exit(1);
      }
      //Make sure we can connect to the mongo database
      db.connectNoSQL(function(err){
        if (err){
          console.log('Unable to connect to mongo database.');
          process.exit(1);
        }
      });
    });
  }
  console.log("  ___              _   ");
  console.log(" / __| __ ___ _  _| |_ ");
  console.log(" \\__ \\/ _/ _ \\ || |  _|");
  console.log(" |___/\\__\\___/\\_,_|\\__|");
  console.log("                       ");
  console.log("Originally created by Jacob Schultz");
  console.log("                       ");
  //For revery server in the database, make sure our cron jobs are up to date
  servers.getAllServers()
  .then(function(serverList){
    //Take the server list and pass it to the handler
    cron.handleServerRecords(serverList)
    .then(function(cronResult){
      console.log('Cron jobs have been verified and are operational');
    })
    .catch(function(error){
      console.log('Unable to verify cron jobs');
      console.log(error);
    });
  })
  .catch(function(error){
    console.log('Unable to verify cron jobs');
    console.log(error);
  });
  //Get a count of the machines cores and spin up that many threads
  var coreCount = require('os').cpus().length;
  //see if their is a core count provided that could be less than whats on the system
  if (process.env.THREAD_COUNT){
    var threadCountSetByUser = parseInt(process.env.THREAD_COUNT);
    if (threadCountSetByUser < coreCount){
      coreCount = threadCountSetByUser;
    }
  }
  for (var i = 0; i < coreCount; i++){
    cluster.fork();
  }
  console.log('Spun up ' + coreCount + ' threads.');
  //If a worker dies, restart a new one
  cluster.on('exit', function(w){
    console.log('Worker %d died, spinning up a new one.', w.id);
    cluster.fork();
  });
// This is a worker process
} else {
  //All of the app code runs in a child process
  var express = require('express');
  var bodyParser = require('body-parser');
  var cors = require('cors');
  var compression = require('compression');
  var helmet = require('helmet');
  var jwt = require('express-jwt');
  var jwttoken = require('jsonwebtoken');
  var cors = require('cors');
  var schedule = require('node-schedule');

  //Check for a JWT Key, if not set to 'local' for tests
  if (!process.env.JWT_KEY){
    process.env.JWT_KEY = 'local';
  }
  //Sets up jwt object to verify key in auth header
  var jwtCheck = jwt({
    secret: process.env.JWT_KEY
  });

  var app = module.exports = express();
  //Setup the swagger docs
  const expressSwagger = require('express-swagger-generator')(app);
  let options = {
      swaggerDefinition: {
          info: {
              description: 'A tool to aggergate devices',
              title: 'Scout',
              version: '0.2.0',
          },
          host: 'localhost:3000',
          basePath: '/',
          consumes : [
            "application/json"
          ],
          produces: [
              "application/json"
          ],
          schemes: ['http', 'https'],
          securityDefinitions: {
              JWT: {
                  type: 'apiKey',
                  in: 'header',
                  name: 'Authorization',
                  description: "",
              }
          }
      },
      basedir: __dirname, //app absolute path
      files: ['./controllers/*.js'] //Path to the API handle folder
  };
  expressSwagger(options);
  //Serve up the reports
  app.use('/reports', express.static('reports'));
  //serve the app contents
  app.use(express.static('../app'));
  //Basic application hardening
  app.use(helmet());
  // parse application/json
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({extended: true}));

  //Allow cross origin requests
  app.use(cors());
  app.use(compression()); //Compress all routes
  //require auth to use endpoints
  app.use('/servers', jwtCheck);
  app.use('/devices', jwtCheck);
  app.use('/reports', jwtCheck);
  app.use('/users/all', jwtCheck);
  app.use('/users/verify', jwtCheck);
  app.use('/settings', jwtCheck);
  app.use('/commands', jwtCheck);
  //Provide custom response middleware
  app.use(function (err, req, res, next) {
    if (err.name === 'UnauthorizedError') {
      res.status(401).send(' ');
    }
  });
  //Setup routes
  app.use('/servers', require('./controllers/servers'));
  app.use('/devices', require('./controllers/devices'));
  app.use('/webhooks', require('./controllers/webhooks'));
  app.use('/patches', require('./controllers/patches'));
  app.use('/users', require('./controllers/users'));
  app.use('/reports', require('./controllers/reports'));
  app.use('/settings', require('./controllers/admin'));
  app.use('/commands', require('./controllers/commands'));

  //Serve the web app
  app.get('/', function(req, res) {
    res.sendFile('../app/index.html');
  });

  if (!module.parent) {
    // var port = process.env.PORT || 3000;
    // app.listen(port, function(){
    //
    // });
    var db = require('./common/db.js');
    db.connect(function(err) {
      if (err) {
        console.log('Unable to connect to database.');
        process.exit(1);
      } else {
        var port = process.env.PORT || 3000;
        app.listen(port, function() {
          console.log('Worker with id: ' + cluster.worker.id + ' on port: ' + port);
        });
        //Connect to the mongo database
        db.connectNoSQL(function(err){
          if (err){
            console.log('Unable to connect to mongo database.');
            process.exit(1);
          }
        });
      }
    });
  }
}
