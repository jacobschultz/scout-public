# Scout Developer/Local Instance Install

The following guide will help you setup a instance of scout running on your local machine. Scout is developed mostly on a mac, but this guide should work just as well for any unix based desktop including Ubuntu.

---

### Contribute to Scout Development Goals Here:

Bounty Tracker: https://www.bountysource.com/trackers/91218894-jacobschultz-scout-public

---

### Development Installation Steps: Getting the required software (without Docker)

1. Start by installing MySQL Community Edition for your platform of choice. After it's installed, create the scout database, then import the sql file at the root of scout:

```
mysql -u user -p

CREATE DATABASE scout;
exit;

mysql -u user -p scout < scout.sql
```

2. Install mongo for your platform and start it up. Next, we are going to setup user authentication. (The path to the mongo.conf may be different on your system).

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

3. Now we are going to install node. Grab a copy of it and install it for your system.
4. After installing node, clone the scout repo. I like to put it in my home directory.

```
git clone https://github.com/jacobschultz/scout-public.git
```

5. After that's been cloned, it's time to run the scout installer. This will setup your env variables and install the node modules.

```
cd scout-public/
ruby installer.rb
```

5a. If the node modules fail to run, you can install/update them at any time by running 'npm install' in the /api directory.
5b. If the installer fails, or you don't have ruby on your machine, you can run the following commands to setup everything manually:

```
cp scout-public/sample.env scout-public/api/.env (Open this file and configure all of your settings. Feel free to leave LDAP Blank)
cd scout-public/api
npm install
npm start
```

6. After that all has ran, we can now start the scout server! Press CRL+C to kill the server at any time and then npm start again to restart it.

```
cd scout-public/api
npm start
```

### Installation Steps with Docker:

The Docker compose setup simplifies the installation of database services and in the future will also simplify the installation of the Scout API.

1. Start by installing Docker [here](https://docs.docker.com/install/). To confirm your installation run:

```
docker -v
```

This setup also requires that you have `docker-compose`. This usually comes with the Docker installation. Check if you have it:

```
docker-compose -v
```

2. Now we are going to install node. Grab a copy of it and install it for your system.
3. After installing node, clone the scout repo. I like to put it in my home directory.

```
git clone https://github.com/jacobschultz/scout-public.git
```

5. After that's been cloned, it's time to run the scout installer. Make sure to choose the Docker setup to speed the process. This will setup your env variables and install the node modules.

```
cd scout-public/
ruby installer.rb
```

5a. If the node modules fail to run, you can install/update them at any time by running 'npm install' in the /api directory.
5b. If the installer fails, or you don't have ruby on your machine, you can run the following commands to setup everything manually:

```
cp scout-public/sample.env scout-public/api/.env (Open this file and configure all of your settings. Feel free to leave LDAP Blank)
cd scout-public/api
npm install
npm start
```

6. Next we can start the Docker services. This will automatically use the credentials you entered in your installation script and create the `Scout` DB in the MySQL instance. To kill the services press CRL+C or run `docker-compose down` if that doens't work.

```
cd api
cd docker-compose up
```

6. After that all has ran, we can now start the scout server! Press CRL+C to kill the server at any time and then npm start again to restart it.

```
cd scout-public/api
npm start
```
