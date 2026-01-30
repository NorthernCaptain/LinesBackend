/**
 * Naval Clash - Multiplayer Battleship Game
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 */

jest.mock("./pool", () => ({
    pool: { execute: jest.fn() },
}))

describe("db/navalclash/index", () => {
    it("should export pool", () => {
        const db = require("./index")
        expect(db.pool).toBeDefined()
    })

    it("should export user functions", () => {
        const db = require("./index")
        expect(db.dbFindUserByUuidAndName).toBeDefined()
        expect(db.dbFindUserById).toBeDefined()
        expect(db.dbCreateUser).toBeDefined()
        expect(db.dbUpdateUserLogin).toBeDefined()
        expect(db.dbUpdateUserPin).toBeDefined()
        expect(db.dbIsPinTaken).toBeDefined()
        expect(db.dbUpdateUserLastDevice).toBeDefined()
    })

    it("should export device functions", () => {
        const db = require("./index")
        expect(db.dbFindDeviceByAndroidId).toBeDefined()
        expect(db.dbCreateDevice).toBeDefined()
        expect(db.dbUpdateDevice).toBeDefined()
        expect(db.dbLinkUserDevice).toBeDefined()
    })

    it("should export session functions", () => {
        const db = require("./index")
        expect(db.dbFindSessionById).toBeDefined()
        expect(db.dbCreateSession).toBeDefined()
        expect(db.dbFindWaitingSession).toBeDefined()
        expect(db.dbJoinSession).toBeDefined()
        expect(db.dbFinishSession).toBeDefined()
        expect(db.dbIncrementMoves).toBeDefined()
        expect(db.dbGetConfig).toBeDefined()
    })

    it("should export message functions", () => {
        const db = require("./index")
        expect(db.dbInsertMessage).toBeDefined()
        expect(db.dbFetchNextMessage).toBeDefined()
        expect(db.dbDeleteAcknowledgedMessages).toBeDefined()
        expect(db.dbDeleteOldMessages).toBeDefined()
        expect(db.getOpponentSessionId).toBeDefined()
    })

    it("should export social functions", () => {
        const db = require("./index")
        expect(db.LIST_TYPE_FRIENDS).toBeDefined()
        expect(db.LIST_TYPE_BLOCKED).toBeDefined()
        expect(db.dbAddRival).toBeDefined()
        expect(db.dbDeleteRival).toBeDefined()
        expect(db.dbGetRivals).toBeDefined()
        expect(db.dbSearchUsers).toBeDefined()
        expect(db.dbGetRecentOpponents).toBeDefined()
        expect(db.dbGetWaitingUsers).toBeDefined()
    })

    it("should export leaderboard functions", () => {
        const db = require("./index")
        expect(db.dbGetTopScores).toBeDefined()
        expect(db.dbSubmitScore).toBeDefined()
    })

    it("should export shop functions", () => {
        const db = require("./index")
        expect(db.dbOrderExists).toBeDefined()
        expect(db.dbRecordPurchase).toBeDefined()
        expect(db.dbAddCoins).toBeDefined()
        expect(db.dbGetCoins).toBeDefined()
        expect(db.dbGetInventory).toBeDefined()
    })

    it("should export weapons functions", () => {
        const db = require("./index")
        expect(db.dbGetUserWeaponInventory).toBeDefined()
        expect(db.dbGetTrackedWeapons).toBeDefined()
        expect(db.dbSetTrackedWeapons).toBeDefined()
        expect(db.dbGetWeaponUsage).toBeDefined()
        expect(db.dbIncrementWeaponUsage).toBeDefined()
        expect(db.dbConsumeWeapons).toBeDefined()
        expect(db.dbGetSessionUserId).toBeDefined()
    })
})
