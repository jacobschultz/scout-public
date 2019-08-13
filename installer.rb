#!/usr/bin/ruby
require 'io/console'

print "  ___              _   \n";
print " / __| __ ___ _  _| |_ \n";
print " \\__ \\/ _/ _ \\ || |  _|\n";
print " |___/\\__\\___/\\_,_|\\__|\n";
print "\n";

print "Thank you for downloading scout. This script will check dependencies and then install the application.\n"
print "Written by Jacob Schultz\n"
print "Available at: github.com/jamf/scout-public\n"
print "\n"

print "Will you be running this as a local development (Docker) environment? (y/n)\n"
docker = gets.chomp

if (docker != "y")
  print "Do you have a MySQL server setup and available to you? (y/n)\n"
  mysql = gets.chomp
  if (mysql != "y")
    print "Please run this installer again after installing MySQL.\n"
    exit
  end

  print "Please provide your MySQL Host: \n"
  mysql_host = gets.chomp
  print "Please provide your MySQL User: \n"
  mysql_user = gets.chomp
  print "Please provide your MySQL Password: \n"
  mysql_password = STDIN.noecho(&:gets).chomp

  print "Do you have a Mongo (NoSQL) server setup and available to you? (y/n)\n"
  nosql = gets.chomp
  if (nosql != "y")
    print "Please run this installer again after installing Mongo.\n"
    exit
  end

  print "Please enter your host including port for Mongo: (For example: localhost:27017) Don't include mongo://\n"
  nosql_host = gets.chomp
  print "Please provide your Mongo Databse name (Default is 'scout')\n"
  nosql_db_name = gets.chomp
  print "Please provide your Mongo Username\n"
  nosql_user = gets.chomp
  print "Please provide your Mongo Password\n"
  nosql_password = gets.chomp
else
  print "Setting default (local) credentials for development.\n"
  mysql_host = "localhost"
  mysql_user = "dev_user"
  mysql_password = "password123"
  nosql_host = "localhost"
  nosql_db_name = "scout"
  nosql_user = "dev_user"
  nosql_password = "password123"
end

print "---------------------------------------------------------------\n"
print "Server Config\n"
print "---------------------------------------------------------------\n"

print "Plese provide the root install directory for scout: (For Example: /Users/jacob.schultz/scount-public/)\n"
root_dir = gets.chomp
# see if there is a trailing slash
if (!root_dir[root_dir.length] == "/")
  root_dir = root_dir + "/"
end
root_dir + "api/"
patch_dir = root_dir + "patches/"

print "Please provide the location of the node executable on your system: (For Example: /usr/local/bin/node)\n"
node_dir = gets.chomp

print "Enter your server hostname:\n"
print "This will write a file to app/js/server-url.js with the host name. It MUST also be updated here if it's changed in the .env file in the future.\n"
hostname = gets.chomp
#Check if a full URL was provided
if (!hostname.include? "http")
  hostname = "http://" + hostname
end
#check if a port was provided
if (!hostname.include? ":")
  hostname = hostname + ":3000"
end

#write the file to app directory
open('./app/js/server-url.js', 'w') do |f|
  f.puts "window.server_host = \"" + hostname + "\";"
end

print "After how many days of being dormant/not checking in would you like to flag devices as inactive?\n"
active_days = gets.chomp
print "Please provide an Encryption Key (MUST RE-ENTER ALL JPS SERVERS IF CHANGED - PICK A STRONG PASSWORD): \n"
enc_key = STDIN.noecho(&:gets).chomp
print "Please provide a JWT Key (Can be changed): \n"
jwt_key = STDIN.noecho(&:gets).chomp

print "Would you like to use LDAP? (y/n)\n"
is_ldap = gets.chomp
#declare these variables because they'll still go in the .env file even if not used
ldap_url = ""
ldap_domain = ""
pin = ""
if (is_ldap == "y")
  print "---------------------------------------------------------------\n"
	print "LDAP Setup\n"
	print "---------------------------------------------------------------\n"

	print "Please provide your LDAP URL (Example: ldap://ldap.server.com:389): \n"
	ldap_url = gets.chomp
	print "Please provide your LDAP Domain Starting at ou= (Example: ou=Users,o=randomkey,dc=jumpcloud,dc=com)\n"
	ldap_domain = gets.chomp
else
  print "---------------------------------------------------------------\n"
	print "User Pin Setup - Since you opted not to use LDAP, a pin to register new users must be set. You should only share this with those who you would like to be able to register for an account. It can also be changed in your .env file and must be entered when registering for a new account.\n"
	print "---------------------------------------------------------------\n"
	print "Enter your alphanumeric register pin:\n"
	pin = gets.chomp
end

print "---------------------------------------------------------------\n"
print "Your settings will now be written to a .env file located at the root of the API Directory. If you'd like to edit them in the future, simply change them in this file. To edit this env file enter 'nano .env' at the root /api directory. You'll need to restart the server for this to take effect. If you change your encryption key, you must reenter servers.\n"
print "---------------------------------------------------------------\n"

#generate the .env file
open('./api/.env', 'w') do |f|
  f.puts "ACTIVE_DAYS=#{active_days}"
  f.puts "JWT_KEY=#{jwt_key}"
  f.puts "ENC_KEY=#{enc_key}"
  f.puts "LDAP_URL=#{ldap_url}"
  f.puts "LDAP_STR=#{ldap_domain}"
  f.puts "SCOUT_URL=#{hostname}"
  f.puts "MYSQL_HOST=#{mysql_host}"
  f.puts "MYSQL_USER=#{mysql_user}"
  f.puts "MYSQL_PASS=#{mysql_password}"
  f.puts "MYSQL_DB=scout"
  f.puts "REG_PIN=#{pin}"
  f.puts "PATCH_DIR=#{patch_dir}"
  f.puts "ROOT_DIR=#{root_dir}"
  f.puts "NODE_DIR=#{node_dir}"
  f.puts "NOSQL_HOST=#{nosql_host}"
  f.puts "NOSQL_DB=#{nosql_db_name}"
  f.puts "NOSQL_USER=#{nosql_user}"
  f.puts "NOSQL_PASS=#{nosql_password}"
  f.puts "DISABLE_SCOUT_ADMIN_USER=false"
  f.puts "SCOUT_ADMIN_USER_NAME=ScoutAdmin"
  f.puts "DEBUG_LOGGING=false"
end

print "\n.env file has been written, now installing node modules.\n"
#now install node modules
value = %x( cd api && npm install )
puts value

print "\nNode modules have been installed!\n\n"
print "Wait!! Before starting the server, you must import the scout mysql database! Login to your mysql server and import the scout.sql file at the root of this project.\n\n"
print "To start the server navigate to the /api directory and run \"npm start\". It's reocmmended that you start the server with pm2 if possible.\n"
