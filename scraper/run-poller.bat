@echo off
cd /d "G:\Amazon and noon deals\scraper"
node poll.js >> "G:\Amazon and noon deals\scraper\data\poller.log" 2>&1
