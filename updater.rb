#!/usr/bin/ruby
print "  ___              _   \n";
print " / __| __ ___ _  _| |_ \n";
print " \\__ \\/ _/ _ \\ || |  _|\n";
print " |___/\\__\\___/\\_,_|\\__|\n";
print "\n";
input_array = ARGV
print "This script will help you to update your scout install. First it will clone the newest version of the master github branch, copy your env files and install any new modules. Then it will replace your existing scout files with the freshly cloned files and add your env setup back to the dir.\n\n"
#make sure the install directory was provided
if (input_array.length < 1)
  print "\n\nError: Please provide the root scout dir as a command line parameter. This is the directory with the /app and /api folders.\n";
  exit
end
install_dir = input_array[0]
#get the newest copy, remove if already exists
result = %x(rm -rf /tmp/scout-public)
print "Cloning the git repo...\n"
result = %x(cd /tmp && git clone https://github.com/jamf/scout-public.git)
#clone the env files
print "Backing up .env files...\n"
result = %x(cp #{install_dir}/api/.env /tmp/scout-bu.env)
result = %x(cp #{install_dir}/app/js/server-url.js /tmp/server-url.js)
#copy the new server files
print "Replacing existing server files with a new copy...\n"
result = %x(cp -a /tmp/scout-public/. #{install_dir})
#now move the server .env files back
result = %x(mv /tmp/scout-bu.env #{install_dir}/api/.env)
result = %x(mv /tmp/server-url.js #{install_dir}/app/js/server-url.js)
#now reinstall any node modules
print "Installing node modules...\n"
value = %x( cd #{install_dir}/api && npm install )
#clean up
print "Cleaning up...\n"
result = %x(rm -rf /tmp/scout-public)
print "Scout has been updated to the most recent master commit. Please double check your .env files to make sure they were properly copied. If the node modules failed to install, simplay run 'npm install' in the api directory. If there are database changes, you'll need to import those manually."
