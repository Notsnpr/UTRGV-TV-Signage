const express = require('express');
const { z } = require('zod');
const db = require('../lib/database');
const { errorResponse, logAudit, getClientIp } = require('../lib/helpers');
const { requireAuth, requireAdmin, requireAuthOrApiKey } = require('../lib/middleware');

const router = express.Router();

// TODO: implement routes

module.exports = router;
