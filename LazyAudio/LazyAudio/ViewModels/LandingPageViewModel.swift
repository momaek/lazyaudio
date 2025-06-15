import Foundation
import SwiftUI
import Combine

@MainActor
class LandingPageViewModel: ObservableObject {
    // MARK: - Published Properties
    @Published var permissionStatuses: [PermissionStatusItem] = []
    
    // MARK: - Private Properties
    private let permissionService = PermissionService()
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - Computed Properties
    var canStartRecording: Bool {
        permissionStatuses.allSatisfy { $0.status == .authorized }
    }
    
    // MARK: - Initialization
    init() {
        setupBindings()
        loadPermissionStatuses()
    }
    
    // MARK: - Private Methods
    private func setupBindings() {
        // 监听权限状态变化
        permissionService.$microphonePermissionStatus
            .combineLatest(permissionService.$systemAudioPermissionStatus)
            .sink { [weak self] microphoneStatus, systemAudioStatus in
                self?.updatePermissionStatuses(
                    microphoneStatus: microphoneStatus,
                    systemAudioStatus: systemAudioStatus
                )
            }
            .store(in: &cancellables)
    }
    
    private func loadPermissionStatuses() {
        updatePermissionStatuses(
            microphoneStatus: permissionService.microphonePermissionStatus,
            systemAudioStatus: permissionService.systemAudioPermissionStatus
        )
    }
    
    private func updatePermissionStatuses(
        microphoneStatus: PermissionState,
        systemAudioStatus: PermissionState
    ) {
        permissionStatuses = [
            PermissionStatusItem(
                id: UUID(),
                title: "permission.microphone.title",
                description: "permission.microphone.description",
                iconName: "mic",
                iconColor: .blue,
                status: microphoneStatus,
                statusText: "permission.status.\(microphoneStatus.rawValue)",
                statusColor: statusColor(for: microphoneStatus),
                action: requestMicrophonePermission
            ),
            PermissionStatusItem(
                id: UUID(),
                title: "permission.system_audio.title",
                description: "permission.system_audio.description",
                iconName: "speaker.wave.2",
                iconColor: .purple,
                status: systemAudioStatus,
                statusText: "permission.status.\(systemAudioStatus.rawValue)",
                statusColor: statusColor(for: systemAudioStatus),
                action: openSystemSettings
            )
        ]
    }
    
    private func statusColor(for status: PermissionState) -> Color {
        switch status {
        case .authorized:
            return .green
        case .denied:
            return .red
        case .notDetermined:
            return .orange
        }
    }
    
    // MARK: - Public Methods
    func requestMicrophonePermission() {
        permissionService.requestMicrophonePermission()
    }
    
    func openSystemSettings() {
        permissionService.openSystemSettings()
    }
    
    func startRecording() {
        // TODO: 实现开始录制功能
    }
    
    func openSettings() {
        // TODO: 实现打开设置功能
    }
}

// MARK: - Permission Status Model
struct PermissionStatusItem: Identifiable {
    let id: UUID
    let title: String
    let description: String
    let iconName: String
    let iconColor: Color
    let status: PermissionState
    let statusText: String?
    let statusColor: Color
    let action: () -> Void
} 