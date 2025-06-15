import Foundation
import AVFoundation
import AppKit

class PermissionService {
    // MARK: - Published Properties
    @Published var microphonePermissionStatus: PermissionState = .notDetermined
    @Published var systemAudioPermissionStatus: PermissionState = .notDetermined
    
    // MARK: - Initialization
    init() {
        checkPermissions()
    }
    
    // MARK: - Private Methods
    private func checkPermissions() {
        Task {
            microphonePermissionStatus = await checkMicrophonePermission()
            systemAudioPermissionStatus = await checkSystemAudioPermission()
        }
    }
    
    private func checkMicrophonePermission() async -> PermissionState {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized:
            return .authorized
        case .denied:
            return .denied
        case .notDetermined:
            return .notDetermined
        case .restricted:
            return .denied
        @unknown default:
            return .notDetermined
        }
    }
    
    private func checkSystemAudioPermission() async -> PermissionState {
        // TODO: 实现系统音频权限检查
        // 这里暂时返回未确定状态
        return .notDetermined
    }
    
    // MARK: - Public Methods
    func requestMicrophonePermission() {
        Task {
            let granted = await AVCaptureDevice.requestAccess(for: .audio)
            microphonePermissionStatus = granted ? .authorized : .denied
        }
    }
    
    func openSystemSettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone") {
            NSWorkspace.shared.open(url)
        }
    }
}

// MARK: - Permission State Enum
enum PermissionState: String {
    case authorized
    case denied
    case notDetermined
} 
