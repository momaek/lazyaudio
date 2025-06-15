//
//  ContentView.swift
//  LazyAudio
//
//  Created by wentx on 2025/6/7.
//

import SwiftUI

struct ContentView: View {
    @State private var selection: AppScreen? = .record
    @State private var hasPermissions = false // TODO: Replace with actual permission check

    var body: some View {
        if hasPermissions {
            mainView
        } else {
            LandingPageView(hasPermissions: $hasPermissions)
        }
    }
    
    var mainView: some View {
        NavigationSplitView {
            List(AppScreen.allCases, selection: $selection) { screen in
                NavigationLink(value: screen) {
                    screen.label
                }
            }
            .navigationSplitViewColumnWidth(200)
        } detail: {
            if let selection = selection {
                switch selection {
                case .record:
                    RecordPageView()
                case .transcribe:
                    TranscribePageView()
                case .history:
                    HistoryPageView()
                case .settings:
                    SettingsPageView()
                }
            } else {
                Text("Select a screen")
            }
        }
    }
}

enum AppScreen: String, CaseIterable, Identifiable {
    case record = "录制"
    case transcribe = "转录"
    case history = "历史"
    case settings = "设置"

    var id: AppScreen { self }

    @ViewBuilder
    var label: some View {
        switch self {
        case .record:
            Label("录制", systemImage: "mic.fill")
        case .transcribe:
            Label("转录", systemImage: "doc.text.fill")
        case .history:
            Label("历史", systemImage: "clock.fill")
        case .settings:
            Label("设置", systemImage: "gearshape.fill")
        }
    }
}

#Preview {
    ContentView()
}
