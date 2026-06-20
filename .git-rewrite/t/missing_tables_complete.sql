mysqldump: [Warning] Using a password on the command line interface can be insecure.
-- MySQL dump 10.13  Distrib 8.0.43, for Linux (x86_64)
--
-- Host: 124.223.54.69    Database: crm_db
-- ------------------------------------------------------
-- Server version	8.0.44-0ubuntu0.24.04.2

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
mysqldump: Error: 'Access denied; you need (at least one of) the PROCESS privilege(s) for this operation' when trying to dump tablespaces

--
-- Table structure for table `photos`
--

DROP TABLE IF EXISTS `photos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `photos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `albumId` int NOT NULL,
  `userId` int NOT NULL,
  `url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `fileKey` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `thumbnail` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `takenAt` timestamp NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `photos`
--

LOCK TABLES `photos` WRITE;
/*!40000 ALTER TABLE `photos` DISABLE KEYS */;
/*!40000 ALTER TABLE `photos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `point_logs`
--

DROP TABLE IF EXISTS `point_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `point_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `actionType` varchar(50) NOT NULL,
  `points` int NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `relatedId` int DEFAULT NULL,
  `balanceAfter` int NOT NULL DEFAULT '0',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `userId` (`userId`),
  KEY `actionType` (`actionType`),
  KEY `createdAt` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `point_logs`
--

LOCK TABLES `point_logs` WRITE;
/*!40000 ALTER TABLE `point_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `point_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `point_rules`
--

DROP TABLE IF EXISTS `point_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `point_rules` (
  `id` int NOT NULL AUTO_INCREMENT,
  `actionType` varchar(50) NOT NULL,
  `actionName` varchar(100) NOT NULL,
  `points` int NOT NULL DEFAULT '0',
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `description` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `actionType` (`actionType`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `point_rules`
--

LOCK TABLES `point_rules` WRITE;
/*!40000 ALTER TABLE `point_rules` DISABLE KEYS */;
INSERT INTO `point_rules` VALUES (1,'add_contact','添加人脉',10,1,'每次添加新联系人获得的积分','2026-01-29 15:10:12','2026-01-29 15:10:12'),(2,'add_tag','打标签',5,1,'为好友添加标签获得的积分','2026-01-29 15:10:12','2026-01-29 15:10:12'),(3,'communication','每次联络',2,1,'与联系人互动沟通获得的积分','2026-01-29 15:10:12','2026-01-29 15:10:12'),(4,'share_contact','共享人脉',15,1,'分享联系人给其他用户获得的积分','2026-01-29 15:10:12','2026-01-29 15:10:12'),(5,'be_referrer','被加为推荐人',20,1,'被其他用户添加为推荐人获得的积分','2026-01-29 15:10:12','2026-01-29 15:10:12'),(6,'daily_signin','每日签到',3,1,'每日签到获得的积分','2026-01-29 15:10:12','2026-01-29 15:10:12'),(7,'consecutive_signin','连续签到',10,1,'连续签到奖励积分','2026-01-29 15:10:12','2026-01-29 15:10:12'),(8,'complete_task','完成任务',8,1,'完成系统任务获得的积分','2026-01-29 15:10:12','2026-01-29 15:10:12'),(9,'participate_activity','参与活动',12,1,'参与平台活动获得的积分','2026-01-29 15:10:12','2026-01-29 15:10:12'),(10,'share_content','分享内容',5,1,'分享内容到社交平台获得的积分','2026-01-29 15:10:12','2026-01-29 15:10:12'),(11,'add_favorite','添加收藏',3,1,'收藏内容获得的积分','2026-01-29 15:10:12','2026-01-29 15:10:12'),(12,'add_comment','发表评论',5,1,'发表评论获得的积分','2026-01-29 15:10:12','2026-01-29 15:10:12');
/*!40000 ALTER TABLE `point_rules` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `point_transactions`
--

DROP TABLE IF EXISTS `point_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `point_transactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `childId` int DEFAULT NULL,
  `amount` int NOT NULL,
  `type` enum('game','task','reward','admin') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `referenceId` int DEFAULT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `point_transactions`
--

LOCK TABLES `point_transactions` WRITE;
/*!40000 ALTER TABLE `point_transactions` DISABLE KEYS */;
/*!40000 ALTER TABLE `point_transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reading_records`
--

DROP TABLE IF EXISTS `reading_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reading_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `kidId` int NOT NULL,
  `storyId` int NOT NULL,
  `clickCount` int NOT NULL DEFAULT '0',
  `readDuration` int NOT NULL DEFAULT '0',
  `completedAt` timestamp NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reading_records`
--

LOCK TABLES `reading_records` WRITE;
/*!40000 ALTER TABLE `reading_records` DISABLE KEYS */;
/*!40000 ALTER TABLE `reading_records` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reading_stories`
--

DROP TABLE IF EXISTS `reading_stories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reading_stories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('template','custom','ai_generated') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'template',
  `coverImageUrl` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `createdBy` int DEFAULT NULL,
  `kidId` int DEFAULT NULL,
  `wordCount` int NOT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reading_stories`
--

LOCK TABLES `reading_stories` WRITE;
/*!40000 ALTER TABLE `reading_stories` DISABLE KEYS */;
/*!40000 ALTER TABLE `reading_stories` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reminder_types`
--

DROP TABLE IF EXISTS `reminder_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reminder_types` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `icon` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 0xF09F9494,
  `color` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT '#6366f1',
  `isDefault` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reminder_types`
--

LOCK TABLES `reminder_types` WRITE;
/*!40000 ALTER TABLE `reminder_types` DISABLE KEYS */;
/*!40000 ALTER TABLE `reminder_types` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reminders`
--

DROP TABLE IF EXISTS `reminders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reminders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `contactId` int NOT NULL,
  `userId` int NOT NULL,
  `reminderTypeId` int DEFAULT NULL,
  `title` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `reminderTime` timestamp NOT NULL,
  `reminderType` enum('normal','birthday') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'normal',
  `isRecurring` tinyint(1) NOT NULL DEFAULT '0',
  `birthMonth` int DEFAULT NULL,
  `birthDay` int DEFAULT NULL,
  `notificationMethod` enum('in_app','in_app_sound') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'in_app',
  `isCompleted` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reminders`
--

LOCK TABLES `reminders` WRITE;
/*!40000 ALTER TABLE `reminders` DISABLE KEYS */;
/*!40000 ALTER TABLE `reminders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reward_redemptions`
--

DROP TABLE IF EXISTS `reward_redemptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reward_redemptions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `rewardId` int NOT NULL,
  `userId` int NOT NULL,
  `childId` int DEFAULT NULL,
  `pointsSpent` int NOT NULL,
  `status` enum('pending','approved','rejected','completed') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `redeemedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `processedAt` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reward_redemptions`
--

LOCK TABLES `reward_redemptions` WRITE;
/*!40000 ALTER TABLE `reward_redemptions` DISABLE KEYS */;
/*!40000 ALTER TABLE `reward_redemptions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `rewards`
--

DROP TABLE IF EXISTS `rewards`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rewards` (
  `id` int NOT NULL AUTO_INCREMENT,
  `createdBy` int NOT NULL,
  `familyId` int DEFAULT NULL,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `icon` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `pointsCost` int NOT NULL DEFAULT '100',
  `stock` int NOT NULL DEFAULT '-1',
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `rewards`
--

LOCK TABLES `rewards` WRITE;
/*!40000 ALTER TABLE `rewards` DISABLE KEYS */;
/*!40000 ALTER TABLE `rewards` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `special_kids`
--

DROP TABLE IF EXISTS `special_kids`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `special_kids` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int DEFAULT NULL,
  `parentUserId` int DEFAULT NULL,
  `name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `avatar` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `stars` int NOT NULL DEFAULT '0',
  `position` enum('left','right') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `special_kids`
--

LOCK TABLES `special_kids` WRITE;
/*!40000 ALTER TABLE `special_kids` DISABLE KEYS */;
/*!40000 ALTER TABLE `special_kids` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `star_redemptions`
--

DROP TABLE IF EXISTS `star_redemptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `star_redemptions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `kidId` int NOT NULL,
  `itemId` int NOT NULL,
  `starsSpent` int NOT NULL,
  `status` enum('pending','approved','rejected','completed') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `redeemedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `processedAt` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `star_redemptions`
--

LOCK TABLES `star_redemptions` WRITE;
/*!40000 ALTER TABLE `star_redemptions` DISABLE KEYS */;
/*!40000 ALTER TABLE `star_redemptions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `star_reward_rules`
--

DROP TABLE IF EXISTS `star_reward_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `star_reward_rules` (
  `id` int NOT NULL AUTO_INCREMENT,
  `activityType` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `activityName` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `starsReward` int NOT NULL DEFAULT '1',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `star_reward_rules_activityType_unique` (`activityType`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `star_reward_rules`
--

LOCK TABLES `star_reward_rules` WRITE;
/*!40000 ALTER TABLE `star_reward_rules` DISABLE KEYS */;
/*!40000 ALTER TABLE `star_reward_rules` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `star_rewards`
--

DROP TABLE IF EXISTS `star_rewards`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `star_rewards` (
  `id` int NOT NULL AUTO_INCREMENT,
  `kidId` int NOT NULL,
  `activityType` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `starsEarned` int NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `star_rewards`
--

LOCK TABLES `star_rewards` WRITE;
/*!40000 ALTER TABLE `star_rewards` DISABLE KEYS */;
/*!40000 ALTER TABLE `star_rewards` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `star_shop_items`
--

DROP TABLE IF EXISTS `star_shop_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `star_shop_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `image` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `starsCost` int NOT NULL DEFAULT '10',
  `stock` int NOT NULL DEFAULT '-1',
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `star_shop_items`
--

LOCK TABLES `star_shop_items` WRITE;
/*!40000 ALTER TABLE `star_shop_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `star_shop_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `task_completions`
--

DROP TABLE IF EXISTS `task_completions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `task_completions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `taskId` int NOT NULL,
  `userId` int NOT NULL,
  `childId` int DEFAULT NULL,
  `completedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `pointsEarned` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `task_completions`
--

LOCK TABLES `task_completions` WRITE;
/*!40000 ALTER TABLE `task_completions` DISABLE KEYS */;
/*!40000 ALTER TABLE `task_completions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tasks`
--

DROP TABLE IF EXISTS `tasks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tasks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `createdBy` int NOT NULL,
  `title` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `taskType` enum('daily','weekly','custom') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'custom',
  `points` int NOT NULL DEFAULT '10',
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tasks`
--

LOCK TABLES `tasks` WRITE;
/*!40000 ALTER TABLE `tasks` DISABLE KEYS */;
/*!40000 ALTER TABLE `tasks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `todos`
--

DROP TABLE IF EXISTS `todos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `todos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `creatorId` int NOT NULL,
  `title` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `dueDate` timestamp NULL DEFAULT NULL,
  `priority` enum('low','medium','high') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium',
  `status` enum('pending','in_progress','completed','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `completedAt` timestamp NULL DEFAULT NULL,
  `relatedContactId` int DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `todos`
--

LOCK TABLES `todos` WRITE;
/*!40000 ALTER TABLE `todos` DISABLE KEYS */;
/*!40000 ALTER TABLE `todos` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_badges`
--

DROP TABLE IF EXISTS `user_badges`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_badges` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `childId` int DEFAULT NULL,
  `badgeId` int NOT NULL,
  `earnedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_badges`
--

LOCK TABLES `user_badges` WRITE;
/*!40000 ALTER TABLE `user_badges` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_badges` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_feature_order`
--

DROP TABLE IF EXISTS `user_feature_order`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_feature_order` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `featureId` int NOT NULL,
  `position` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=60039 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_feature_order`
--

LOCK TABLES `user_feature_order` WRITE;
/*!40000 ALTER TABLE `user_feature_order` DISABLE KEYS */;
INSERT INTO `user_feature_order` VALUES (60020,870413,1,0,'2026-01-25 02:27:45','2026-01-25 02:27:45'),(60021,870413,14,1,'2026-01-25 02:27:45','2026-01-25 02:27:45'),(60022,870413,2,2,'2026-01-25 02:27:45','2026-01-25 02:27:45'),(60023,870413,3,3,'2026-01-25 02:27:45','2026-01-25 02:27:45'),(60024,870413,4,4,'2026-01-25 02:27:45','2026-01-25 02:27:45'),(60025,870413,6,5,'2026-01-25 02:27:45','2026-01-25 02:27:45'),(60026,870413,7,6,'2026-01-25 02:27:45','2026-01-25 02:27:45'),(60027,870413,8,7,'2026-01-25 02:27:45','2026-01-25 02:27:45'),(60028,870413,9,8,'2026-01-25 02:27:45','2026-01-25 02:27:45'),(60029,870413,11,9,'2026-01-25 02:27:45','2026-01-25 02:27:45'),(60030,870413,12,10,'2026-01-25 02:27:45','2026-01-25 02:27:45'),(60031,870413,13,11,'2026-01-25 02:27:45','2026-01-25 02:27:45'),(60032,870413,15,12,'2026-01-25 02:27:45','2026-01-25 02:27:45'),(60033,870413,16,13,'2026-01-25 02:27:45','2026-01-25 02:27:45'),(60034,870413,17,14,'2026-01-25 02:27:45','2026-01-25 02:27:45'),(60035,870413,18,15,'2026-01-25 02:27:45','2026-01-25 02:27:45'),(60036,870413,19,16,'2026-01-25 02:27:45','2026-01-25 02:27:45'),(60037,870413,10,17,'2026-01-25 02:27:45','2026-01-25 02:27:45'),(60038,870413,5,18,'2026-01-25 02:27:45','2026-01-25 02:27:45');
/*!40000 ALTER TABLE `user_feature_order` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_feature_permissions`
--

DROP TABLE IF EXISTS `user_feature_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_feature_permissions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `featureKey` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `isEnabled` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_feature_permissions`
--

LOCK TABLES `user_feature_permissions` WRITE;
/*!40000 ALTER TABLE `user_feature_permissions` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_feature_permissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_preferences`
--

DROP TABLE IF EXISTS `user_preferences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_preferences` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `homeCardOrder` json DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_preferences_userId_unique` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_preferences`
--

LOCK TABLES `user_preferences` WRITE;
/*!40000 ALTER TABLE `user_preferences` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_preferences` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `vocabulary_master`
--

DROP TABLE IF EXISTS `vocabulary_master`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vocabulary_master` (
  `id` int NOT NULL AUTO_INCREMENT,
  `word` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `language` enum('chinese','english') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `wordType` enum('character','word') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'word',
  `translation` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pinyin` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pronunciation` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `category` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'general',
  `difficulty` enum('easy','medium','hard') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'easy',
  `example` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `imageUrl` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `audioUrl` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `vocabulary_master`
--

LOCK TABLES `vocabulary_master` WRITE;
/*!40000 ALTER TABLE `vocabulary_master` DISABLE KEYS */;
/*!40000 ALTER TABLE `vocabulary_master` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `wrong_questions`
--

DROP TABLE IF EXISTS `wrong_questions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wrong_questions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `kidId` int NOT NULL,
  `gameType` enum('math','antonym','character') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `questionData` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `userAnswer` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `correctAnswer` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `reviewed` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wrong_questions`
--

LOCK TABLES `wrong_questions` WRITE;
/*!40000 ALTER TABLE `wrong_questions` DISABLE KEYS */;
/*!40000 ALTER TABLE `wrong_questions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `openId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `username` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `passwordHash` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `email` varchar(320) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `loginMethod` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role` enum('super_admin','parent','baby') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'parent',
  `familyId` int DEFAULT NULL,
  `avatar` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `points` int NOT NULL DEFAULT '0',
  `sharingEnabled` tinyint(1) NOT NULL DEFAULT '0',
  `isLocked` tinyint(1) NOT NULL DEFAULT '0',
  `failedLoginAttempts` int NOT NULL DEFAULT '0',
  `lastFailedLogin` timestamp NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `lastSignedIn` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_openId_unique` (`openId`),
  UNIQUE KEY `users_username_unique` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=4957141 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (28,'legacy_28_ce956a21bd83fb7d','hyy329','$2b$10$74LKCx/Oxe.tZQHK9A/qYuaEY5VYDmpx.txC0fROFV1L/wU0jbrJy','hyy329','1821113@qq.com','password','super_admin',NULL,'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/kjgmNaH8wU2okdbYBsMXbA/avatars/28-sVBgfZbrReY-FCXEuAJHj.png',0,0,0,0,'2026-01-29 20:09:36','2026-01-07 22:34:22','2026-01-31 13:07:14','2026-01-31 00:07:13'),(30184,'legacy_30184_6f521308d723beaf','miao','$2b$10$NrNCnNFfumJON654m/ZO..FyU/zCZuFY/hvuJjEEiAJzO0Jkv0RO2','喵喵',NULL,'password','baby',NULL,NULL,0,0,0,0,NULL,'2026-01-08 01:14:40','2026-01-23 04:05:40','2026-01-08 01:14:40'),(30185,'legacy_30185_6fbdfb8392c9e1f5','wang','$2b$10$uOXmnLfTzPjVBvKvXK5cpOm.NnvVyIWMeVVBdhohl6i5h2F9XG0VG','旺旺',NULL,'password','baby',NULL,NULL,0,0,0,0,NULL,'2026-01-08 01:14:40','2026-01-23 04:05:40','2026-01-08 01:14:40'),(510025,'legacy_510025_f6747e5d2f36a8f2','zhangjue','$2b$10$M2KI0zmegSteEesscn32Iu1FiMY8To8F/7Q5/WkMNfM1nTtv9C5Em','zhangjue',NULL,'password','parent',NULL,NULL,0,0,0,0,NULL,'2026-01-09 21:02:47','2026-01-23 04:05:40','2026-01-09 21:02:47'),(540628,'legacy_540628_5bc47950698d156d','贝贝','$2b$10$x8/4nrnoTMtu5gmr6wa6QOrmbT7HU2pWpa9rmkj0NRRhd0FYlB942','贝贝',NULL,'password','baby',NULL,NULL,0,0,0,0,NULL,'2026-01-10 02:39:02','2026-01-23 04:05:40','2026-01-10 02:39:02'),(540801,'legacy_540801_61b77a3545408c55','yunting','$2b$10$pJPWzq9oeNUH4SupwDfIcuwvhwJBcjlbxzHDrxdtEq0Cgve3pKX6K','Yunting',NULL,'password','parent',NULL,NULL,0,0,0,0,'2026-01-25 05:50:10','2026-01-10 03:25:17','2026-01-31 14:46:20','2026-01-31 14:46:20'),(600105,'legacy_600105_f60f7ca6a29ebb0b','test','test-hash','测试管理员',NULL,'password','parent',NULL,NULL,0,0,0,0,NULL,'2026-01-10 12:05:36','2026-01-23 04:05:41','2026-01-10 12:05:36'),(870413,'legacy_870413_9e32d70bc0dcca31','jiang','$2b$10$Y6MraOCP2v8AEay5Fa/Sd.dSY86bLSpTZXiwmWGFO6ADV6GPTUw0q','jiang',NULL,'password','super_admin',NULL,NULL,0,0,0,0,'2026-01-28 11:59:43','2026-01-11 17:41:14','2026-01-31 11:12:26','2026-01-31 11:12:27'),(1260259,'legacy_1260259_2c00f94e8a963c2e','jilldibg','$2b$10$yot1PJ4WPIPFf9ic0VcC5Ot.wfch3NqAKbZFIjODCyp0HfXN/8Avu','Jillding',NULL,'password','parent',NULL,NULL,0,0,0,0,NULL,'2026-01-12 18:46:09','2026-01-23 04:05:41','2026-01-12 18:46:09'),(1260396,'legacy_1260396_034831f9511c65ec','qixu','$2b$10$4cgoLIR.fCpCDevhM.ovS.KkHyB18zHUN0sjWv9f9jQnBzO9YMdyC','qixu',NULL,'password','parent',NULL,NULL,0,0,0,0,NULL,'2026-01-12 19:09:34','2026-01-23 04:05:41','2026-01-12 19:09:34'),(1260427,'legacy_1260427_b839b8c8d3791c09','baby_宝宝_ww1u','$2b$10$jSI7SHqHSwgn4KKxqf1K6Oro0g0voZPnIP.oeUvlxd52/db//g61.','宝宝',NULL,'password','baby',NULL,NULL,0,0,0,0,NULL,'2026-01-12 19:11:02','2026-01-23 04:05:41','2026-01-12 19:11:02'),(1890093,'legacy_1890093_0299bd48c0868d4a','Jack','$2b$10$545FaUoXRklDqsUUBSQ0lOaz9NLa5PwoTrWJhyButMkOtJThnUSUW','Jack',NULL,'password','parent',NULL,NULL,0,0,0,0,NULL,'2026-01-14 00:31:34','2026-01-23 04:05:41','2026-01-14 00:31:34'),(2040145,'legacy_2040145_06d8610122b904fc','WHY','$2b$10$DtBUaHMBX3mPo9XBYOp1OeUuDyvKhOBhf7W/wLYCwQ0bPcZvs890O','WHY',NULL,'password','parent',NULL,NULL,0,0,0,0,NULL,'2026-01-14 19:53:32','2026-01-23 04:05:41','2026-01-14 19:53:32'),(2250097,'legacy_2250097_3d30a3fef7d2fdb6','test-admin-1768414868265','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-15 04:21:09','2026-01-23 04:05:41','2026-01-15 04:21:09'),(2250098,'legacy_2250098_1d9426e0432ef579','test-admin-1768414870362','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-15 04:21:10','2026-01-23 04:05:41','2026-01-15 04:21:10'),(2250113,'legacy_2250113_b55ba0791e2d213c','test-admin-1768414880959','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-15 04:21:21','2026-01-23 04:05:42','2026-01-15 04:21:21'),(2250114,'legacy_2250114_226ead05496cfd1e','test-admin-1768414881838','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-15 04:21:21','2026-01-23 04:05:42','2026-01-15 04:21:21'),(2250115,'legacy_2250115_fb3a1977201e6d2e','test-admin-1768414882498','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-15 04:21:22','2026-01-23 04:05:42','2026-01-15 04:21:22'),(2250116,'legacy_2250116_de2b2ba199a16ebd','test-admin-1768414883157','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-15 04:21:23','2026-01-23 04:05:42','2026-01-15 04:21:23'),(2250117,'legacy_2250117_a176e9b6c1d6e8d9','test-admin-1768414884267','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-15 04:21:24','2026-01-23 04:05:42','2026-01-15 04:21:24'),(2250118,'legacy_2250118_0c640a5723127bf1','test-admin-1768414884932','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-15 04:21:25','2026-01-23 04:05:42','2026-01-15 04:21:25'),(2250119,'legacy_2250119_4c9b6deacd83132c','test-admin-1768414885817','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-15 04:21:25','2026-01-23 04:05:42','2026-01-15 04:21:25'),(2250120,'legacy_2250120_1d6f604cb502caa5','test-admin-1768414886698','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-15 04:21:26','2026-01-23 04:05:42','2026-01-15 04:21:26'),(2250121,'legacy_2250121_dd2e9d9530249607','test-admin-1768414887580','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-15 04:21:27','2026-01-23 04:05:42','2026-01-15 04:21:27'),(2250129,'legacy_2250129_e0976a8d517d700f',NULL,NULL,'测试家长',NULL,'password','parent',NULL,NULL,0,0,0,0,NULL,'2026-01-15 04:25:26','2026-01-19 20:50:43','2026-01-15 04:25:26'),(2280013,'legacy_2280013_72a1a72d9501ad4d','test-admin-1768443171686','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-15 12:12:52','2026-01-23 04:05:42','2026-01-15 12:12:52'),(2430037,'legacy_2430037_4e5af2070b601912','test-admin-1768493477613','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-16 02:11:18','2026-01-23 04:05:42','2026-01-16 02:11:18'),(2430038,'legacy_2430038_047a043521e10ab2','test-admin-1768493479685','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-16 02:11:19','2026-01-23 04:05:42','2026-01-16 02:11:19'),(2430039,'legacy_2430039_02904057132f1b86','test-admin-1768493480579','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-16 02:11:20','2026-01-23 04:05:42','2026-01-16 02:11:20'),(2430040,'legacy_2430040_f1b08b241e4eb269','test-admin-1768493481472','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-16 02:11:21','2026-01-23 04:05:42','2026-01-16 02:11:21'),(2430041,'legacy_2430041_3d431b181ae3cbd2','test-admin-1768493482359','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-16 02:11:22','2026-01-23 04:05:43','2026-01-16 02:11:22'),(2430042,'legacy_2430042_550b36f29d86f018','test-admin-1768493483247','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-16 02:11:23','2026-01-23 04:05:43','2026-01-16 02:11:23'),(2430043,'legacy_2430043_c6fe3939c3c7cd67','test-admin-1768493484136','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-16 02:11:24','2026-01-23 04:05:43','2026-01-16 02:11:24'),(2430044,'legacy_2430044_4ce54618c05f5e5f','test-admin-1768493485025','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-16 02:11:25','2026-01-23 04:05:43','2026-01-16 02:11:25'),(2430045,'legacy_2430045_7b69d0ad3622bbd5','test-admin-1768493485693','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-16 02:11:25','2026-01-23 04:05:43','2026-01-16 02:11:25'),(2430046,'legacy_2430046_480072613766dbff','test-admin-1768493486584','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-16 02:11:26','2026-01-23 04:05:43','2026-01-16 02:11:26'),(2430047,'legacy_2430047_c97dc7059b2b2782','test-admin-1768493487482','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-16 02:11:27','2026-01-23 04:05:43','2026-01-16 02:11:27'),(2460008,'legacy_2460008_64ea92db12abe5c5','test-admin-1768494962714','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-16 02:36:03','2026-01-23 04:05:43','2026-01-16 02:36:03'),(2460009,'legacy_2460009_281da69c7754e443','test-admin-1768494963089','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-16 02:36:03','2026-01-23 04:05:43','2026-01-16 02:36:03'),(2460010,'legacy_2460010_8516a76d6ec76f70','test-admin-1768494963121','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-16 02:36:03','2026-01-23 04:05:43','2026-01-16 02:36:03'),(2460011,'legacy_2460011_68b4b3fd01c00f05','test-admin-1768494963166','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-16 02:36:03','2026-01-23 04:05:43','2026-01-16 02:36:03'),(2460021,'legacy_2460021_b74e256aaf44a585','test-admin-1768494963591','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-16 02:36:03','2026-01-23 04:05:44','2026-01-16 02:36:03'),(2460022,'legacy_2460022_0d95b8a08059f1d9','test-admin-1768494963622','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-16 02:36:03','2026-01-23 04:05:44','2026-01-16 02:36:03'),(2460023,'legacy_2460023_f9afc69838c3c720','test-admin-1768494963656','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-16 02:36:03','2026-01-23 04:05:44','2026-01-16 02:36:03'),(2460024,'legacy_2460024_5476b23e8a89d6eb','test-admin-1768494963861','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-16 02:36:03','2026-01-23 04:05:44','2026-01-16 02:36:03'),(2460025,'legacy_2460025_716536a664096a37','test-admin-1768494963935','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-16 02:36:03','2026-01-23 04:05:44','2026-01-16 02:36:03'),(2460026,'legacy_2460026_aadd431094e9b25f','test-admin-1768494963985','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-16 02:36:03','2026-01-23 04:05:44','2026-01-16 02:36:03'),(2460027,'legacy_2460027_a73b418d736ac07e','test-admin-1768494964022','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-16 02:36:04','2026-01-23 04:05:44','2026-01-16 02:36:04'),(2460028,'legacy_2460028_908e888ae6da1a81','test-admin-1768494964069','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-16 02:36:04','2026-01-23 04:05:44','2026-01-16 02:36:04'),(2460029,'legacy_2460029_8101421774e586e2','test-admin-1768494964224','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-16 02:36:04','2026-01-23 04:05:44','2026-01-16 02:36:04'),(2460030,'legacy_2460030_d0c5a06c01876c2b','test-admin-1768494964358','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-16 02:36:04','2026-01-23 04:05:44','2026-01-16 02:36:04'),(2460031,'legacy_2460031_0e0d40085e32066c','test-admin-1768494964395','test-hash','测试管理员',NULL,'password','super_admin',NULL,NULL,0,0,0,0,NULL,'2026-01-16 02:36:04','2026-01-23 04:05:44','2026-01-16 02:36:04'),(2460038,'legacy_2460038_6f839f3d7433d76b',NULL,NULL,'测试家长',NULL,'password','parent',NULL,NULL,0,0,0,0,NULL,'2026-01-16 02:36:18','2026-01-19 20:50:43','2026-01-16 02:36:18'),(3060001,'legacy_3060001_92df454c498c50d0','cx8618','$2b$10$xjrCk/ZJb9HukwI/9Ut6Euw.wu62xSaawfx0VPjut6rpgJqxxchs6','阿潇',NULL,'password','parent',NULL,NULL,0,0,0,0,NULL,'2026-01-17 13:00:58','2026-01-29 02:47:33','2026-01-29 02:47:34'),(3720059,'3XH9zMttpz9ePc2B8nyCho',NULL,NULL,'shufen1971','shufen1971@outlook.com','oauth','parent',NULL,NULL,0,0,0,0,NULL,'2026-01-20 23:54:41','2026-01-21 14:06:32','2026-01-21 14:06:32'),(4200292,'local_testuser_1769027103935','testuser','$2b$10$gdBQQrwQC3W4Ki6NF/MqYePrd0NHRNO5mLSrrDgAbAKKqRD02cCcG','测试用户',NULL,'password','parent',NULL,NULL,0,0,0,2,'2026-01-29 16:31:59','2026-01-22 01:25:04','2026-01-30 05:31:59','2026-01-22 01:25:51'),(4200293,'YLXveZruWqxLxV2aKDXNxw',NULL,NULL,'run','runyimacau@gmail.com','google','parent',NULL,NULL,0,0,0,0,NULL,'2026-01-22 17:47:15','2026-01-27 16:59:00','2026-01-27 03:59:00'),(4680302,'local_zhanghui_1769222901759','zhanghui','$2b$10$pBNTMq57ezlcn6.N/tVInudjPvG0dmcVLFOXKt7/nOap93CzH75f.','张慧',NULL,'password','parent',NULL,'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/kjgmNaH8wU2okdbYBsMXbA/avatars/4680302-FxDHnj2vMRlCWGaR6IyBF.png',0,0,0,0,NULL,'2026-01-24 02:48:21','2026-01-31 09:48:31','2026-01-31 09:48:31'),(4952003,'local_abc_1769353141579','abc','$2b$10$mbUpSO/dOMq8efX886K9xedImUgengXqvmlMwr4scx/HVeZqwL5dC','Y',NULL,'password','parent',1,NULL,0,0,0,0,NULL,'2026-01-25 14:59:01','2026-01-26 09:29:58','2026-01-26 01:29:59'),(4952374,'test-ledger-1769378062632',NULL,NULL,'测试用户',NULL,NULL,'parent',NULL,NULL,0,0,0,0,NULL,'2026-01-25 21:54:24','2026-01-25 21:54:24','2026-01-25 13:54:23'),(4952375,'test-ledger-1769378104193',NULL,NULL,'测试用户',NULL,NULL,'parent',NULL,NULL,0,0,0,0,NULL,'2026-01-25 21:55:06','2026-01-25 21:55:06','2026-01-25 13:55:04'),(4952376,'test-ledger-1769378144599',NULL,NULL,'测试用户',NULL,NULL,'parent',NULL,NULL,0,0,0,0,NULL,'2026-01-25 21:55:47','2026-01-25 21:55:47','2026-01-25 13:55:45'),(4952766,'local_liulifan_1769418627378','liulifan','$2b$10$iOYU3UErhO9ccnf9IJB1LeL.uVK6SCl4XoN551ON5RfbKtmV12WqG','刘力凡',NULL,'password','parent',2,NULL,0,0,0,0,'2026-01-28 13:57:54','2026-01-26 09:10:27','2026-01-31 07:54:39','2026-01-31 07:54:40');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-01-31  9:52:04
