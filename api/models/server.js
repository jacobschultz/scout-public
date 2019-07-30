require('dotenv').config();

var db = require('../common/db.js');
var https = require('https');
var axios = require('axios');
//Used to read XML config file for JPS User Object
var fs = require('fs');
const path = require("path");
var xml2js = require('xml2js');


//Allow self signed certs
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false
  })
});

exports.addNewServer = function(url, username, password, limited, expanded){
  return new Promise(function(resolve,reject) {
    //Make sure we can make a connection to the jamf pro server
    exports.checkConnection(url,username,password)
    .then(function(res){
      //Need to parse to a string due to how JPS returns JSON, then back to object
      return JSON.parse(JSON.stringify(res));
    })
    //Insert the server into the database
    .then(function(response){
      //Built an object to represent the server
      //Encrypt the password - it's not super secure, but it needs to be read later and this is better than plaintext
      var data = { "url" : url, "username" : username, "password" : db.encryptString(password), "cron_update" : limited, "cron_update_expanded" : expanded,
                   "org_name" : response.activation_code.organization_name, "activation_code" : response.activation_code.code};
      db.get().query('INSERT INTO servers SET ?', [data], function(error, results, fields) {
        if (error) {
          reject({"error" : "Unable to insert server to the database"});
        } else {
          // Enable the scout admin user if the key doesn't exist or isn't false
          if (!process.env.DISABLE_SCOUT_ADMIN_USER || process.env.DISABLE_SCOUT_ADMIN_USER == "false") {
            console.log('setup scout admin');
            //Setup the scout admin user
            exports.setupScoutAdminUser(url,username,password)
            .then(function(res){
              resolve(res);
            })
            .catch(function (error){
              reject({"error" : "Unable to setup scout admin user"});
            });
          } else {
            resolve(response);
          }
        }
      });
    })
    .catch(function (error) {
      exports.addServerErrorByUrl(url, 'Connection Failure', error);
      reject({"error" : "Unable to contact server"});
    });
  });
}

exports.setupScoutAdminUser = function(url, username, password){
  return new Promise(function(resolve,reject) {
    //Now try to add the scout user
    var generatedPassword = db.getRandomString(15);
    exports.addScoutAdminuser(url, username, password, generatedPassword)
    .then(function(res){
      //Parse the id and update the server database for future updates
      xml2js.parseString(res, function (err, result) {
        var userId = parseInt(result.account.id[0]);
        //Now update the database
        exports.setScoutAdminUser(url, userId, generatedPassword)
        .then(function(result){
          resolve(result);
        })
        .catch(function(error){
          console.log(error);
          reject(error);
        });
      });
    })
    .catch(function(error){
      console.log(error);
      reject(error);
    });
  });
}

exports.addScoutAdminuser = function(url, username, password, generatedPassword){
  var data = fs.readFileSync(path.resolve(__dirname, '../common/scout-user-template.xml'), 'utf-8');
  //Replace the password with a good one
  data = data.replace("<password></password>", "<password>"+generatedPassword+"</password>");
  return new Promise(function(resolve,reject) {
    axiosInstance.post(url + '/JSSResource/accounts/userid/0', data, {
      auth: {
        username: username,
        password: password
      },
      headers: {'Content-Type': 'text/xml'}
    })
    .then(function (response) {
      resolve(response.data);
    })
    .catch(function (error) {
      exports.addServerErrorByUrl(url, 'Connection Failure', error);
      reject(error);
    });
  });
}

exports.deleteScoutAdminUser = function(url, username, password){
  let scoutAdminUserName = process.env.SCOUT_ADMIN_USER_NAME;
  if (!process.env.SCOUT_ADMIN_USER_NAME) {
    scoutAdminUserName = 'ScoutAdmin';
  }
  console.og
  return new Promise(function(resolve,reject) {
    try {
      axiosInstance.delete(url + '/JSSResource/accounts/username/'+scoutAdminUserName, {
        auth: {
          username: username,
          password: password
        }
      })
      .then(function (response) {
        resolve(response.data);
      })
      .catch(function (error) {
        reject(error);
      });
    } catch (exc) {
      reject(exc);
    }
  });
}

exports.updateScoutAdminUserPassword = function(url){
  return new Promise(function(resolve,reject) {
    //First get the server so we can find the admin user id
    exports.getServerFromURL(url)
    .then(function(serverDetails){
      var scoutAdminId = serverDetails[0].scout_admin_id;
      var username = serverDetails[0].username;
      var password = db.decryptString(serverDetails[0].password);
      //If any of the values are null, setup a new user
      if (scoutAdminId == null || username == null){
        //Setup the scout admin user
        exports.setupScoutAdminUser(url,username,password)
        .then(function(res){
          let resultObject = { is_insert : true, response : res};
          resolve(resultObject);
        })
        .catch(function (error){
          reject(error);
        });
      } else {
        //Now get the user model and assign a new password
        var data = fs.readFileSync(path.resolve(__dirname, '../common/scout-user-template.xml'), 'utf-8');
        //Replace the password with a good one
        var newPassword = db.getRandomString(15);
        data = data.replace("<password></password>", "<password>"+newPassword+"</password>");
        try {
          axiosInstance.put(url + '/JSSResource/accounts/userid/' + scoutAdminId, data, {
              auth: {
                username: username,
                password: password
              },
              headers: {'Content-Type': 'text/xml'}
            })
            .then(function(response) {
              //Now update the password in the database
              exports.setScoutAdminPassword(url,db.encryptString(newPassword))
              .then(function(result){
                let resultObject = { is_insert : false, response : result};
                resolve(resultObject);
              })
              .catch(function (error) {
                reject('Unable to update password in database, last known password: ' + newPassword);
              });
            })
            .catch(function (error) {
              reject(error);
            });
        } catch (exc) {
          reject(exc);
        }
      }
    })
    .catch(function (error) {
      reject(error);
    });
  })
}

exports.checkConnection = function(url, username, password){
  return new Promise(function(resolve,reject) {
    axiosInstance.get(url + '/JSSResource/activationcode', {
      auth: {
        username: username,
        password: password
      }
    })
    .then(function (response) {
      resolve(response.data);
    })
    .catch(function (error) {
      exports.addServerErrorByUrl(url, 'Connection Failure', error);
      reject(error);
    });
  });
}

exports.wipeScoutAdminUser = function(url) {
  return new Promise(function(resolve,reject) {
    exports.getServerFromURL(url)
    .then(function(serverDetails){
      var username = serverDetails[0].username;
      var password = db.decryptString(serverDetails[0].password);
      // First remove the user from the JPS
      exports.deleteScoutAdminUser(url, username, password)
      .then(jssResult => {
        // Now remove it from the scout database
        exports.resetScoutAdminUser(url)
        .then(dbResult => {
          resolve(dbResult);
        })
        .catch(error => {
          reject(error);
        });
      })
      .catch(error => {
        reject(error);
      })
    })
    .catch(error => {
      reject(error);
    })
  });
}

exports.getAllServers = function(){
  return new Promise(function(resolve,reject) {
    db.get().query('SELECT * FROM servers', function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}

exports.deleteServer = function(id) {
  //First query for the url
  return new Promise(function(resolve,reject) {
    db.get().query('SELECT url,username,password FROM servers WHERE id = ?',[id], function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        const serverObject = results[0];
        serverObject.password = db.decryptString(serverObject.password);
        db.get().query('DELETE FROM servers WHERE id = ?',[id], function(error, results, fields) {
          if (error) {
            reject(error);
          } else {
            const res = {server_object : serverObject, res: results};
            resolve(res);
          }
        });
      }
    });
  });
}

exports.setScoutAdminUser = function(url, userId, generatedPassword) {
  return new Promise(function(resolve,reject) {
    db.get().query('UPDATE servers SET scout_admin_id = ?, scout_admin_password = ? WHERE url = ?',[userId,generatedPassword,url], function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}

exports.resetScoutAdminUser = function(url) {
  const updateObject = {scout_admin_id : null, scout_admin_password: null};
  return new Promise(function(resolve,reject) {
    db.get().query('UPDATE servers SET ? WHERE url = ?',[updateObject,url], function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}

exports.updateServer = function(id, updateObject){
  return new Promise(function(resolve,reject) {
    db.get().query('UPDATE servers SET ? WHERE id = ?',[updateObject,id], function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}

exports.setScoutAdminPassword = function(url, passwordEncrypted) {
  return new Promise(function(resolve,reject) {
    db.get().query('UPDATE servers SET scout_admin_password = ? WHERE url = ?',[passwordEncrypted,url], function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}

exports.addServerErrorByUrl = function(serverUrl, type, message){
  return new Promise(function(resolve,reject) {
    //First get the server object and Id from the url
    exports.getServerFromURL(serverUrl)
    .then(function(server){
      return exports.addServerError(server[0].id, type, message);
    })
    .catch(error =>{
      reject(error);
    });
  });
}

exports.addServerError = function(serverId, type, message){
  var dbObject = {server_id : serverId, type : type, message : message};
  return new Promise(function(resolve,reject) {
    db.get().query('INSERT INTO server_errors SET ?',[dbObject], function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}

exports.getServerFromURL = function(url){
  return new Promise(function(resolve,reject) {
    db.get().query('SELECT * FROM servers WHERE url = ?', url, function(error, results, fields) {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}

exports.getDeviceByTypeFromJPS = function(url,type,username,password){
  return new Promise(function(resolve,reject) {
    axiosInstance.get(url + '/JSSResource/'+type+'/subset/basic', {
      auth: {
        username: username,
        password: password
      }
    })
    .then(function (response) {
      resolve(response.data);
    })
    .catch(function (error) {
      exports.addServerErrorByUrl(url, 'Connection Failure', error);
      reject(error);
    });
  });
}

function translateAPIDeviceToDatabaseObject(device, serverId, type){
  var lastDate;
  if (type == "mobile" || type == "tv"){
    lastDate = device.last_inventory_update_utc;
  } else {
    lastDate = device.report_date_utc;
  }
  var dbObject = {"server_id" : serverId, "device_type" : type, "jss_id" : device.id, "jss_name" : cleanInput(device.name),
                  "jss_serial" : device.serial_number, "jss_last_inventory" : lastDate,
                  "jss_model" : device.model, "jss_managed" : device.managed, "jss_udid" : device.udid};
  return dbObject;
}

function cleanInput(dirtyString) {
  // clean non-ascii characters from string
  return dirtyString.replace(/[^\x00-\x7F]/g, "");
}

exports.getAllDevices = function(url, serverId, username, password){
  return new Promise(function(resolve,reject) {
    var deviceTypes = ['computers', 'mobiledevices'];
    Promise.all(deviceTypes.map(type => exports.getDeviceByTypeFromJPS(url,type,username,password))).then(function(allDevices) {
      var parsedDeviceObjects = [];
      for (i = 0; i < allDevices.length; i++){
        //Parse to JS object due to the way JPS API returns JSON
        var deviceObjList = JSON.parse(JSON.stringify(allDevices[i]));
        if ('computers' in deviceObjList){
          var unparsedList = deviceObjList.computers;
          unparsedList.forEach(function(d) {
            parsedDeviceObjects.push(translateAPIDeviceToDatabaseObject(d, serverId, 'computer'));
          });
        } else if ('mobile_devices' in deviceObjList){
          var unparsedList = deviceObjList.mobile_devices;
          unparsedList.forEach(function(d) {
            //sort out tvos devices since they are stored as 'mobiledevices' in the jss
            if (d.model.includes('Apple TV')){
              parsedDeviceObjects.push(translateAPIDeviceToDatabaseObject(d, serverId, 'tv'));
            } else {
              parsedDeviceObjects.push(translateAPIDeviceToDatabaseObject(d, serverId, 'mobile'));
            }
          });
        }
      }
      resolve(parsedDeviceObjects);
    })
    .catch(function (err){
      reject(err);
    });
  });
}
