# ************************************************************
# Sequel Pro SQL dump
# Version 4541
#
# http://www.sequelpro.com/
# https://github.com/sequelpro/sequelpro
#
# Host: 127.0.0.1 (MySQL 5.6.37)
# Database: scout
# Generation Time: 2018-12-28 21:58:42 +0000
# ************************************************************


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


# Dump of table devices
# ------------------------------------------------------------

DROP TABLE IF EXISTS `devices`;

CREATE TABLE `devices` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `server_id` int(11) DEFAULT NULL,
  `device_type` varchar(128) DEFAULT NULL,
  `jss_id` int(11) DEFAULT NULL,
  `jss_name` varchar(255) DEFAULT NULL,
  `jss_serial` varchar(255) DEFAULT NULL,
  `jss_last_inventory` varchar(512) DEFAULT NULL,
  `jss_udid` varchar(512) DEFAULT NULL,
  `jss_os_version` varchar(255) DEFAULT NULL,
  `jss_managed` tinyint(1) DEFAULT NULL,
  `jss_Model` varchar(255) DEFAULT NULL,
  `last_update_epoch` int(11) DEFAULT NULL,
  `expanded_inventory` tinyint(1) DEFAULT '1',
  `is_active` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



# Dump of table patch_servers
# ------------------------------------------------------------

DROP TABLE IF EXISTS `patch_servers`;

CREATE TABLE `patch_servers` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `base_url` varchar(512) DEFAULT NULL,
  `cron_update` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



# Dump of table reports
# ------------------------------------------------------------

DROP TABLE IF EXISTS `reports`;

CREATE TABLE `reports` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL DEFAULT '',
  `created` date NOT NULL,
  `created_by` int(11) NOT NULL,
  `conditions_count` int(11) DEFAULT NULL,
  `type` varchar(128) NOT NULL DEFAULT '',
  `fields_to_select` longtext,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



# Dump of table reports_line_item
# ------------------------------------------------------------

DROP TABLE IF EXISTS `reports_line_item`;

CREATE TABLE `reports_line_item` (
  `report_id` int(11) NOT NULL,
  `item_order` int(11) NOT NULL,
  `condition` varchar(12) DEFAULT '',
  `parenthesis_one` tinyint(1) DEFAULT '0',
  `field` varchar(255) NOT NULL DEFAULT '',
  `operator` varchar(255) NOT NULL DEFAULT '',
  `value` varchar(255) NOT NULL DEFAULT '',
  `parenthesis_two` tinyint(1) DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



# Dump of table server_errors
# ------------------------------------------------------------

DROP TABLE IF EXISTS `server_errors`;

CREATE TABLE `server_errors` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `server_id` int(11) NOT NULL,
  `type` varchar(128) NOT NULL DEFAULT '',
  `message` longtext NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



# Dump of table servers
# ------------------------------------------------------------

DROP TABLE IF EXISTS `servers`;

CREATE TABLE `servers` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `url` varchar(255) NOT NULL DEFAULT '',
  `username` varchar(255) NOT NULL DEFAULT '',
  `password` varchar(255) NOT NULL DEFAULT '',
  `cron_update` varchar(255) NOT NULL DEFAULT '',
  `cron_update_expanded` varchar(255) NOT NULL DEFAULT '',
  `org_name` varchar(255) DEFAULT NULL,
  `activation_code` varchar(255) DEFAULT NULL,
  `expanded_inventory` tinyint(1) DEFAULT NULL,
  `scout_admin_id` int(1) DEFAULT NULL,
  `scout_admin_password` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;



# Dump of table users
# ------------------------------------------------------------

DROP TABLE IF EXISTS `users`;

CREATE TABLE `users` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `email` varchar(255) DEFAULT NULL,
  `hash` varchar(512) DEFAULT NULL,
  `notifications` tinyint(1) DEFAULT '1',
  `can_edit` tinyint(1) DEFAULT '1',
  `mdm_commands` tinyint(1) DEFAULT '1',
  `can_delete` tinyint(1) DEFAULT '1',
  `can_create` tinyint(1) DEFAULT '1',
  `can_edit_users` tinyint(1) DEFAULT NULL,
  `can_build_reports` tinyint(1) DEFAULT NULL,
  `is_admin` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;




/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
