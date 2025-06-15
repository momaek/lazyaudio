import Foundation
import Combine
import SwiftUI

class SettingsPageViewModel: ObservableObject {
    // MARK: - 发布属性
    @Published var autoStartRecording = false
    @Published var minimizeToMenuBar = false
    @Published var defaultSaveLocation = "~/Documents/LazyAudio"
    @Published var enableAutoCleanup = false
    @Published var cleanupTime = "cleanup.weekly"
    @Published var retentionTime = "retention.30days"
    @Published var audioQuality = "quality.high"
    @Published var sampleRate = "sample_rate.44.1"
    @Published var channels = "channels.stereo"
    @Published var selectedLanguage = "zh-Hans"
    
    // MARK: - 常量
    let cleanupTimeOptions = ["cleanup.daily", "cleanup.weekly", "cleanup.monthly"]
    let retentionTimeOptions = ["retention.7days", "retention.30days", "retention.90days", "retention.180days", "retention.365days"]
    let audioQualityOptions = ["quality.low", "quality.medium", "quality.high", "quality.lossless"]
    let sampleRateOptions = ["sample_rate.22.05", "sample_rate.44.1", "sample_rate.48", "sample_rate.96"]
    let channelOptions = ["channels.mono", "channels.stereo"]
    let languageOptions = [
        ("简体中文", "zh-Hans"),
        ("English", "en")
    ]
    
    // MARK: - 私有属性
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - Environment Objects
    @EnvironmentObject private var appState: AppState
    
    // MARK: - 计算属性
    var version: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
    }
    
    var storageUsage: StorageUsage {
        // TODO: 实现实际的存储使用情况计算
        StorageUsage(used: 1024 * 1024 * 100, total: 1024 * 1024 * 1024)
    }
    
    // MARK: - 初始化
    init() {
        setupBindings()
        loadSettings()
    }
    
    // MARK: - 私有方法
    private func setupBindings() {
        // 监听设置变化
        Publishers.CombineLatest4($autoStartRecording, $minimizeToMenuBar, $defaultSaveLocation, $enableAutoCleanup)
            .sink { [weak self] _, _, _, _ in
                self?.saveSettings()
            }
            .store(in: &cancellables)
        
        Publishers.CombineLatest4($cleanupTime, $retentionTime, $audioQuality, $sampleRate)
            .sink { [weak self] _, _, _, _ in
                self?.saveSettings()
            }
            .store(in: &cancellables)
        
        $channels
            .sink { [weak self] _ in
                self?.saveSettings()
            }
            .store(in: &cancellables)
    }
    
    private func loadSettings() {
        // TODO: 从 UserDefaults 或其他存储加载设置
        print("加载设置")
    }
    
    private func saveSettings() {
        // TODO: 保存设置到 UserDefaults 或其他存储
        print("保存设置")
    }
    
    // MARK: - 公共方法
    func selectDefaultSaveLocation() {
        // TODO: 实现文件夹选择对话框
        print("选择默认保存位置")
    }
    
    func checkForUpdates() {
        // TODO: 实现检查更新功能
        print("检查更新")
    }
    
    func openPrivacyPolicy() {
        // TODO: 实现打开隐私政策
        print("打开隐私政策")
    }
    
    func openUserAgreement() {
        // TODO: 实现打开用户协议
        print("打开用户协议")
    }
    
    // MARK: - Language Methods
    func setLanguage(_ identifier: String) {
        selectedLanguage = identifier
        appState.setLocale(identifier)
    }
} 