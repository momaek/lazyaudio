import SwiftUI

struct SettingsPageView: View {
    @StateObject private var viewModel = SettingsPageViewModel()
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                // 标题区域
                titleSection
                
                // 语言设置
                SettingsCard(title: "settings.language.title".localized) {
                    Picker("settings.language.title".localized, selection: $viewModel.selectedLanguage) {
                        ForEach(viewModel.languageOptions, id: \.1) { name, identifier in
                            Text(name).tag(identifier)
                        }
                    }
                    .onChange(of: viewModel.selectedLanguage) { newValue in
                        viewModel.setLanguage(newValue)
                    }
                    .font(.system(size: 14))
                    .frame(width: 200, alignment: .leading)
                }
                
                // 通用设置
                generalSettingsSection
                
                // 存储设置
                storageSettingsSection
                
                // 高级设置
                advancedSettingsSection
                
                // 关于
                aboutSection
            }
            .padding(40)
            .frame(maxWidth: 800, alignment: .leading)
        }
        .background(Color(NSColor.windowBackgroundColor))
    }
    
    // MARK: - 标题区域
    private var titleSection: some View {
        Text("page.settings.title".localized)
            .font(.system(size: 28, weight: .bold))
            .foregroundColor(Color(NSColor.textColor))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, 8)
    }
    
    // MARK: - 常规设置区域
    private var generalSettingsSection: some View {
        SettingsCard(title: "settings.general.title".localized) {
            VStack(alignment: .leading, spacing: 20) {
                Toggle("settings.general.auto_start".localized, isOn: $viewModel.autoStartRecording)
                    .font(.system(size: 14))
                Toggle("settings.general.minimize".localized, isOn: $viewModel.minimizeToMenuBar)
                    .font(.system(size: 14))
                HStack {
                    Text("settings.general.save_location".localized)
                        .font(.system(size: 14))
                    Spacer()
                    Button {
                        viewModel.selectDefaultSaveLocation()
                    } label: {
                        Text(viewModel.defaultSaveLocation)
                            .font(.system(size: 14))
                            .foregroundColor(Color(NSColor.controlAccentColor))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
    
    // MARK: - 存储设置区域
    private var storageSettingsSection: some View {
        SettingsCard(title: "settings.storage.title".localized) {
            VStack(alignment: .leading, spacing: 20) {
                Toggle("settings.storage.auto_cleanup".localized, isOn: $viewModel.enableAutoCleanup)
                    .font(.system(size: 14))
                if viewModel.enableAutoCleanup {
                    Picker("settings.storage.cleanup_time".localized, selection: $viewModel.cleanupTime) {
                        ForEach(viewModel.cleanupTimeOptions, id: \.self) { option in
                            Text(option.localized).tag(option)
                        }
                    }
                    .font(.system(size: 14))
                    .frame(width: 200, alignment: .leading)
                    Picker("settings.storage.retention_time".localized, selection: $viewModel.retentionTime) {
                        ForEach(viewModel.retentionTimeOptions, id: \.self) { option in
                            Text(option.localized).tag(option)
                        }
                    }
                    .font(.system(size: 14))
                    .frame(width: 200, alignment: .leading)
                }
                VStack(alignment: .leading, spacing: 8) {
                    Text("settings.storage.usage".localized)
                        .font(.system(size: 14))
                    ProgressView(value: viewModel.storageUsage.used, total: viewModel.storageUsage.total)
                        .progressViewStyle(.linear)
                    HStack {
                        Text("settings.storage.used".localized(viewModel.storageUsage.formattedUsed))
                        Spacer()
                        Text("settings.storage.total".localized(viewModel.storageUsage.formattedTotal))
                    }
                    .font(.system(size: 12))
                    .foregroundColor(Color(NSColor.secondaryLabelColor))
                }
            }
        }
    }
    
    // MARK: - 高级设置区域
    private var advancedSettingsSection: some View {
        SettingsCard(title: "settings.advanced.title".localized) {
            VStack(alignment: .leading, spacing: 20) {
                Picker("settings.advanced.quality".localized, selection: $viewModel.audioQuality) {
                    ForEach(viewModel.audioQualityOptions, id: \.self) { option in
                        Text(option.localized).tag(option)
                    }
                }
                .font(.system(size: 14))
                .frame(width: 200, alignment: .leading)
                Picker("settings.advanced.sample_rate".localized, selection: $viewModel.sampleRate) {
                    ForEach(viewModel.sampleRateOptions, id: \.self) { option in
                        Text(option.localized).tag(option)
                    }
                }
                .font(.system(size: 14))
                .frame(width: 200, alignment: .leading)
                Picker("settings.advanced.channels".localized, selection: $viewModel.channels) {
                    ForEach(viewModel.channelOptions, id: \.self) { option in
                        Text(option.localized).tag(option)
                    }
                }
                .font(.system(size: 14))
                .frame(width: 200, alignment: .leading)
            }
        }
    }
    
    // MARK: - 关于区域
    private var aboutSection: some View {
        SettingsCard(title: "settings.about.title".localized) {
            VStack(alignment: .leading, spacing: 20) {
                HStack {
                    Text("app.version".localized)
                        .font(.system(size: 14))
                    Spacer()
                    Text(viewModel.version)
                        .font(.system(size: 14))
                        .foregroundColor(Color(NSColor.secondaryLabelColor))
                }
                Button {
                    viewModel.checkForUpdates()
                } label: {
                    Text("button.check_update".localized)
                        .font(.system(size: 14))
                }
                .buttonStyle(.bordered)
                Button {
                    viewModel.openPrivacyPolicy()
                } label: {
                    Text("button.privacy_policy".localized)
                        .font(.system(size: 14))
                }
                .buttonStyle(.plain)
                Button {
                    viewModel.openUserAgreement()
                } label: {
                    Text("button.user_agreement".localized)
                        .font(.system(size: 14))
                }
                .buttonStyle(.plain)
            }
        }
    }
}

// MARK: - 设置卡片组件
struct SettingsCard<Content: View>: View {
    let title: String
    let content: Content
    
    init(title: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(title)
                .font(.system(size: 18, weight: .medium))
                .foregroundColor(Color(NSColor.textColor))
            content
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(NSColor.controlBackgroundColor))
        .cornerRadius(12)
        .shadow(color: Color.black.opacity(0.08), radius: 8, x: 0, y: 2)
    }
}

// MARK: - 预览
struct SettingsPageView_Previews: PreviewProvider {
    static var previews: some View {
        SettingsPageView()
    }
} 