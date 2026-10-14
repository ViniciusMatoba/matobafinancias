'use strict';

// Inicia o Firebase Admin uma única vez; o resto do código importa db/FieldValue/getMessaging daqui.
const admin = require('firebase-admin');
// firebase-admin 13+: o namespace admin.firestore()/admin.messaging() saiu; usa os submódulos
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

admin.initializeApp();
const db = getFirestore();

module.exports = { db, FieldValue, getMessaging };
