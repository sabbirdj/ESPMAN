#!/bin/bash
cd /home/ubuntu/ESPMAN
export $(grep -v '^#' .env | xargs)
~/.bun/bin/bun fix.js
