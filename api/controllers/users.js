var users = require('express').Router();
var user = require('../models/user.js');
var jwt = require('express-jwt');
var secretKey = process.env.JWT_KEY;
var bcrypt = require('bcrypt-nodejs');
var ldap = require('ldapjs');
var jwttoken = require('jsonwebtoken');
var audit = require('../common/logger.js').logActivity;
var logError = require('../common/logger.js').logError;


function createToken(user) {
  //Sign a new JWT token
  return jwttoken.sign(user, process.env.JWT_KEY, { expiresIn: 60*60*5 });
}

function hasPermission(userObject, permisison){
  return (userObject[permisison] == 1 || userObject[permisison] == true);
}

function authDN(dn, password, cb) {
  var client = ldap.createClient({url: process.env.LDAP_URL});
  client.bind(dn, password, function (err) {
    client.unbind();
    cb(err === null, err);
  });
}

/**
 * This endpoint gets a list of active scout users and their permissions. It requires auth unlike the other user endpoints.
 * @route GET /users/all
 * @group Users - Operations about Scout Users
 * @returns {object} 200 - An object containing a list of scout users in the current server
 * @returns {Error}  500 - Unable to get user details from the database
 * @returns {Error}  401 - User does not have the 'can_edit_users' permission
 */
users.get('/all', function(req,res){
  //Check if the user has permission to do user managment
  if (!req.user || !hasPermission(req.user, 'can_edit_users')){
    audit(req.user, "Failed attempt to list all users.")
    //This user isn't authorized, exit
    return res.status(401).send({ error : "User has no permissions" });
  }
  //get the users from the database
  user.getAllUsers()
  .then(function(userList){
    audit(req.user, "All users list accessed.")
    return res.status(200).send(userList);
  })
  .catch(error => {
    console.log(error);
    logError({message: "Unable to get users.", user: req.user, error});
    return res.status(500).send({
      error: "Unable to get users"
    });
  });
});

/**
 * This endpoint creates a new user in the scout database
 * @route POST /users/create
 * @group Users - Operations about Scout Users
 * @param {string} email.body.required - The email of the new user (also their username)
 * @param {string} password.body.required - The password for the user
 * @param {string} register_pin.body.required - The pin required to register for the server (alphanumeric)
 * @returns {object} 201 - An object containing the User information and a JWT token
 * @returns {Error}  400 - Missing required fields
 * @returns {Error}  401 - Incorrect register pin
 * @returns {Error}  409 - User already exists by that email
 * @returns {Error}  500 - Internal server error inserting the user
 */
users.post('/create', function(req, res) {
  //check for all fields in request
  if (!req.body.email || !req.body.password || !req.body.register_pin) {
    return res.status(400).send({  error : "Missing Required Fields" });
  }
  if (req.body.register_pin != process.env.REG_PIN){
    audit({user_agent: req.headers['user-agent'], ip: req.connection.remoteAddress, message: `Tried to create ${req.body.email} user with incorrect PIN: ${req.body.register_pin}`});
    return res.status(401).send({ error : "Incorrect Register Pin"});
  }
  //Insert the user into the database
  user.createUser(req.body.email, req.body.password)
  .then(function(userObject){
    //Send a success with the token
    audit({user: req.body.email, user_agent: req.headers['user-agent'], ip: req.connection.remoteAddress, message: `Successfully created user.`});
    return res.status(201).send({status : "success", token: createToken(userObject)});
  })
  .catch(error => {
    console.log('User Register Failed: ');
    console.log(error);
    logError({message: "Unable to create users.", user: req.user, error});
    //Check for dupe user error
    if (error.hasOwnProperty('status')){
      return res.status(409).send({  error: "Email already exists"  });
    } else {
      return res.status(500).send({error: "Unable to create user"});
    }
  });
});

/**
 * This endpoint returns a JWT token for a given username and password
 * @route POST /users/login/basic
 * @group Users - Operations about Scout Users
 * @param {string} email.body.required - The email of the user (also their username)
 * @param {string} password.body.required - The password for the user
 * @returns {object} 200 - An object containing the User information and a JWT token
 * @returns {Error}  400 - Missing required fields
 * @returns {Error}  401 - Incorrect username or password
 * @returns {Error}  400 - Generic login error
 */
users.post('/login/basic', function(req, res) {
  //check for all fields in request
  if (!req.body.email || !req.body.password) {
    return res.status(400).send({
      error : "Email and Password Required"
    });
  }
  //Get the user and verify password
  user.getUserFromEmail(req.body.email)
  .then(function(userObject){
    if (!userObject || !bcrypt.compareSync(req.body.password, userObject[0].hash)) {
      audit({user: req.body.email, user_agent: req.headers['user-agent'], ip: req.connection.remoteAddress, message: `Failed login attempt.`});
      return res.status(401).send({
        error : "Unable to Log In"
      });
    }
    var user = { "id" : userObject[0].id, "email" : userObject[0].email, "can_mdm" : userObject[0].mdm_commands, "notificaitons" : userObject[0].notifications,
                 "can_edit" : userObject[0].can_edit, "can_delete" : userObject[0].can_delete, "can_create" : userObject[0].can_create, "can_edit_users" : userObject[0].can_edit_users,
                 "can_build_reports" : userObject[0].can_build_reports, "is_admin" : userObject[0].is_admin
                };
    var resp = { userId : userObject[0].id, token : createToken(user), "can_mdm" : userObject[0].mdm_commands, "notificaitons" : userObject[0].notifications,
                "can_edit" : userObject[0].can_edit, "can_delete" : userObject[0].can_delete, "can_create" : userObject[0].can_create, "can_edit_users" : userObject[0].can_edit_users,
                "can_build_reports" : userObject[0].can_build_reports, "is_admin" : userObject[0].is_admin};
    audit({user: req.body.email, user_agent: req.headers['user-agent'], ip: req.connection.remoteAddress, message: "Successful login."});
    res.status(200).send(resp);
  })
  .catch(error => {
    logError({message: "Unable to log in user.", user: req.user, error});
    console.error(error);
    return res.status(400).send({ error: "Unable to log in user"});
  });
});

/**
 * This endpoint compares a given password the the user identified by the JWT token provided
 * @route POST /users/verify
 * @group Users - Operations about Scout Users
 * @param {string} password.body.required - The password for the user
 * @returns {object} 200 - An object containing whether or not the password is valid
 * @returns {Error}  400 - Missing required fields
 * @returns {Error}  500 - Generic server error
 */
users.post('/verify', function(req,res){
  //Make sure all of the proper fields were provided
  if (!req.body.password || !req.user){
    return res.status(400).send({
      error : "Missing required fields"
    });
  }
  //Get the user by Id and compare the hash to the password provided
  user.getUserById(req.user.id)
  .then(function(userObject){
    var isVerified = true;
    //Compare the pssword to the hash in the database
    if (!userObject || !bcrypt.compareSync(req.body.password, userObject.hash)) {
      //Incorrect hash or can't find user
      isVerified = false;
    }
    return res.status(200).send({ verified : isVerified});
  })
  .catch(error => {
    logError({message: "Unable to find user.", user: req.user, error});
    return res.status(500).send({
      error: "Unable to find user"
    });
  });
});

/**
 * This endpoint returns a JWT token for a given username and password in an ldap group
 * @route POST /users/login/ldap
 * @group Users - Operations about Scout Users
 * @param {string} username.body.required - The username of the user in ldap
 * @param {string} password.body.required - The password for the user in ldap
 * @returns {object} 200 - An object containing the User information and a JWT token
 * @returns {Error}  400 - Missing required fields
 * @returns {Error}  401 - Incorrect username or password
 * @returns {Error}  400 - Generic login error
 */
users.post('/login/ldap', function(req, res) {
  if (!req.body.username || !req.body.password){
    return res.status(400).send({
      error : "Missing required fields - username, password"
    });
  }
  authDN('uid='+req.body.username+','+process.env.LDAP_STR, req.body.password, function(result,err){
    if (err){
      return res.status(401).send({
        error : "Unable to login"
      });
    } else {
      var user = { 'username' : req.body.username };
      return res.status(200).send({
        status : "success",
        token : createToken(user)
      });
    }
  });
});

module.exports = users;
