# iOS Host (Safari Web Extension)

This folder is the future home of the minimal SwiftUI host app that packages the ForgeFill web extension for iOS / iPadOS / macOS Safari.

Until the 2026 Safari Web Extension Packager is fully available for non-Mac environments, the standard path is:

1. Open Xcode → File → New → Project → Safari Extension App (or Web Extension)
2. Replace the generated extension resources with the files from `../extension/dist`
3. Set background to non-persistent
4. Use App Groups if you want the SwiftUI side to edit the same profiles
5. Submit via App Store Connect / TestFlight

The web extension logic itself needs no changes for Safari.
