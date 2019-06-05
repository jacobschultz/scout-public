# How to Install Scout for Production Use

In the following guide we will walk through setting up scout to be used on a production server. This includes installing dependencies such as MySQL, Mongo, and Node.js. After that we will setup our web server with a free https cert. To finish up we will get our node server running, and proxy it through nginx. 

# Required Server Specs
  - Ubuntu Server 16.04 or higher. (Ubuntu is the only *officially* supported server at this time)
  - 2GB or more of RAM 
  
### Step One - Install Server Software Packages ###
1. Install the Web Server package that will proxy the connection to our node.js server.
```
sudo apt-get update
sudo apt-get install nginx
```
2. Start the web server: 
```
sudo systemctl start nginx
```
3. Now we will setup a free https certificate from let's encrypt. First we will add the repository and then install the 'certbot' utility which will handle getting, installing and renewing the https cert. 
```
sudo add-apt-repository ppa:certbot/certbot
sudo apt-get update
sudo apt-get install python-certbot-nginx
```
4. After that is setup, we are going to edit the configuration file for Nginx to allow access to our site. In the file below there will be an underscore by the server_name variable. Edit it to look something like the following.  
```
sudo nano /etc/nginx/sites-available/default
```

```
. . .
server_name example.com www.example.com;
. . .
```
5. Restart Nginx: 
```
sudo systemctl reload nginx
```
6. Obtain an SSL Certficate. It's suggested that ALL traffic is routed through https. 
```
sudo certbot --nginx -d example.com -d www.example.com
```
7. Test that https is working by visting the site and looking for the default nginx page! 
8. Install MySQL Server. Setup a database user. 
```
sudo apt-get install mysql-server
```
9. Install the mongo db. 
```
sudo apt-get install -y mongodb-org
```
10. It's important that we now secure the mongo installation and scout database. First, we'll create a new user with read/write on the scout database, then we'll enable auth in the mongo settings.
```
mongo

use scout;
db.createUser({ user : "ScoutAdmin", pwd : "supersecure", roles : [{role : "readWrite", db: "scout"}] });
exit

sudo /etc/mongod.conf (May be at a different location based on server/version - can run 'systemctl status mongodb' to see location)

security:
    authorization: "enabled"
    
sudo service mongod restart
```
### Step Two - Installing and Configuring Node and Scout###
1. Install the latest of node.js and some essential packages using the following commands: 
```
curl -sL https://deb.nodesource.com/setup_6.x -o nodesource_setup.sh
sudo bash nodesource_setup.sh

sudo apt-get install nodejs
sudo apt-get install build-essential
```
2. We now have node installed, so we can get the Scout server files using the following commands. This will clone the master branch which will feature the latest and greatest stable features. To get future updates and releases simply use the command 'git pull' in this directory. 

```
cd ~
git clone https://github.com/jacobschultz/scout-public.git
cd scout-public
```
3. Start by creating the scout mysql database and importing the .sql file to setup the tables using the following commands. 
```
mysql -u root -p
> CREATE database scout;
> exit;
mysql -u root -p scout < scout.sql
```
4. Run the scout installer and follow the onscreen instructions. The installer will install all of the node modules required for scout to run properly. 
```
cd ~/scout-public 
sudo ruby installer.rb
```
5. After the installer finishes, start the server for the first time by entering the following command. You can verify the server is running by visiting yoursite:3000. 
```
npm start
```
6. After verifying the server is running, you can kill that process as we will be starting it with a utility called 'pm2' which will manage the server on our behalf. 

### Step Three - Setting up the Node -> Nginx Proxy 
1. First we will install the pm2 utility and start the server using that. pm2 will start the node server in the background and manage automatically keeping the connection alive. 
```
sudo npm install -g pm2
cd ~/scout-public/api
pm2 start app.js
```
2. Next nginx will be setup as the reverse proxy server. Edit the following file: 
```
sudo nano /etc/nginx/sites-available/default
```
3. Find the location / block and edit it's contents to match the following. Since Scout works on server 3000 by default, this will setup a proxy from 443 connections to the node server running locally. 
```
. . .
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```
4. Restart Nginx: 
```
sudo systemctl restart nginx
```

That's it! Everything should be setup and running in your production enviornment. Big thanks to DigitalOcean and their guide listed here (https://www.digitalocean.com/community/tutorials/how-to-set-up-a-node-js-application-for-production-on-ubuntu-16-04) about setting up a production node.js application.
