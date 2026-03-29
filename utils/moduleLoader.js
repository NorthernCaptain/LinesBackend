/**
 * LinesBackend - Dynamic Module Loader
 * Copyright (c) 2026 NorthernCaptain
 * All rights reserved.
 *
 * Loads external modules from MODULES_PATH env var.
 * Each module must export: { name, mountPath, createRouter, setupMaster? }
 */

const path = require("path")

/**
 * Loads all modules specified in MODULES_PATH environment variable.
 * MODULES_PATH is a comma-separated list of paths to module directories.
 * Each module directory must have an index.js conforming to the module contract.
 *
 * @returns {Array<Object>} Array of loaded module objects
 */
function loadModules() {
    const modulesPath = process.env.MODULES_PATH
    if (!modulesPath) return []

    const paths = modulesPath
        .split(":")
        .map((p) => p.trim())
        .filter(Boolean)

    const modules = []

    for (const modPath of paths) {
        try {
            const resolved = path.resolve(modPath)
            const mod = require(resolved)

            if (!mod.name || !mod.mountPath || !mod.createRouter) {
                console.error(
                    `Module at ${modPath}: missing required fields (name, mountPath, createRouter)`
                )
                continue
            }

            modules.push(mod)
            console.log(
                `Module "${mod.name}" loaded from ${modPath} → ${mod.mountPath}`
            )
        } catch (error) {
            console.error(`Failed to load module at ${modPath}:`, error.message)
        }
    }

    return modules
}

module.exports = { loadModules }
