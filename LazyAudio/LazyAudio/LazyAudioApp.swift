//
//  LazyAudioApp.swift
//  LazyAudio
//
//  Created by wentx on 2025/6/7.
//

import SwiftUI

@main
struct LazyAudioApp: App {
    @StateObject private var appState = AppState()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(\.locale, appState.locale)
                .environmentObject(appState)
        }
    }
}
