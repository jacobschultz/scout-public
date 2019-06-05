# How to Install Scout for Production Use

In the following guide we will walk through setting up scout to be used on a production server. This includes installing dependencies such as MySQL, Mongo, and Node.js. To finish up we will get our node server running, and proxy it through apache2. 

# Required Server Specs
  - RHEL 6.0 or higher
  - 2GB or more of RAM 
  
### Step One - Install Server Software Packages ###
1. Install the Web Server package that will proxy the connection to our node.js server.
```
yum install httpd
```
2. Start the web server: 
```
sudo systemctl start httpd.service
OR
sudo service httpd start
```

3. Install MySQL Server. Setup a database user. 
```
wget https://dev.mysql.com/get/mysql80-community-release-el6-1.noarch.rpm
sudo yum localinstall mysql80-community-release-el6-1.noarch.rpm
sudo yum install mysql-community-server
sudo service mysqld start
```
4. Setup the MySQL User - find the temporary password and setup a scout user
```
grep 'temporary password' /var/log/mysqld.log
mysql_secure_installation
```

5. Install the mongo db. 
```
sudo nano /etc/yum.repos.d/mongodb-org-4.0.repo
[mongodb-org-4.0]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/redhat/$releasever/mongodb-org/4.0/x86_64/
gpgcheck=1
enabled=1
gpgkey=https://www.mongodb.org/static/pgp/server-4.0.asc

sudo yum install -y mongodb-org
sudo service mongod start
```

6. It's important that we now secure the mongo installation and scout database. First, we'll create a new user with read/write on the scout database, then we'll enable auth in the mongo settings.
```
mongo

use scout;
db.createUser({ user : "ScoutAdmin", pwd : "supersecure", roles : [{role : "readWrite", db: "scout"}] });
exit

sudo /etc/mongod.conf

security:
    authorization: "enabled"
    
sudo service mongod restart
```

### Step Two - Installing and Configuring Node and Scout ###
1. Install the latest of node.js and some essential packages using the following commands: 
```
sudo yum install -y gcc-c++ make
curl -sL https://rpm.nodesource.com/setup_8.x | sudo -E bash -

sudo yum install -y nodejs
```
2. We now have node installed, so we can get the Scout server files using the following commands. This will clone the master branch which will feature the latest and greatest stable features. To get future updates and releases simply use the command 'git pull' in this directory. 

```
cd ~
sudo yum install git
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
sudo yum install ruby (Ruby 2.0 or higher is required, follow this guide to upgrade - https://tecadmin.net/install-ruby-latest-stable-centos/)
cd ~/scout-public 
sudo ruby installer.rb
```
If you don't have the io/console gem, that can be installed with the following command: 
```
gem install io-console
```
4a. (**Optional**) We can skip the ruby installation by running the following commands ourselves: 
```
cd ~/scout-public 
cp sample.env api/.env
nano api/.env (EDIT THIS FILE)

nano app/js/server-url.js
//FILL FILE WITH:
window.server_host = 'http://127.0.0.1';

cd api 
npm install
```
5. After the installer finishes, start the server for the first time by entering the following command. You can verify the server is running by visiting yoursite:3000. 
```
npm start
```
Newer versions of MySQL may need to enable username/password auth: 
```
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'password'
```
6. After verifying the server is running, you can kill that process as we will be starting it with a utility called 'pm2' which will manage the server on our behalf. 

### Step Three - Setting up the Node -> Apache2 Proxy 
1. First we will install the pm2 utility and start the server using that. pm2 will start the node server in the background and manage automatically keeping the connection alive. 
```
sudo npm install -g pm2
cd ~/scout-public/api
pm2 start app.js
```
2. After pm2 is started, we should be able to hit the server at url.com:3000. Next, we are going to forward all requests to the server to port 3000 using a reverse proxy with apache. 
```
sudo nano /etc/httpd/conf.d/default-site.conf
```
Fill in the default site file with the following virtual host. This will redirect all traffic on port 80 (default http port) to our node server.
```
<VirtualHost *:80>
    ProxyPreserveHost On

    ProxyPass / http://127.0.0.1:3000/ retry=0
    ProxyPassReverse / http://127.0.0.1:3000/
</VirtualHost>
```
Restart Apache, and give the server a test. Some systems may throw a 503, if that's the case give the following command a try: 
```
sudo /usr/sbin/setsebool httpd_can_network_connect 1
```
3. It's important that we secure all connections to the server with https. Below we will be setting up the server with a self signed cert, but you can use your own if you'd like. 
```
sudo yum install mod_ssl -y
sudo service httpd restart
```
The server should now be able to be hit at https://serverurl, however you'll likely see a red hat test page as we haven't forwarded connections to our node server yet. 
