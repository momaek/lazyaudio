import SwiftUI

struct LandingPageView: View {
    @StateObject private var viewModel = LandingPageViewModel()
    @Binding var hasPermissions: Bool
    @AppStorage("language") private var language = "zh-Hans"
    
    private let availableLanguages = [
        ("zh-Hans", "简体中文"),
        ("en", "English")
    ]
    
    var body: some View {
        // 内容区域
        VStack(alignment: .leading, spacing: 0) {
            // 标题区域
            titleSection
                .padding(.top, 48)
                .padding(.bottom, 32)
            
            // 权限状态区域
            permissionStatusSection
                .padding(.bottom, 32)
            
            Spacer()
            
            // 语言选择
            languageSelector
                .padding(.bottom, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding(.horizontal, 48)
        .frame(minWidth: 1000, minHeight: 600)
        .background(Color(NSColor.windowBackgroundColor))
        .overlay(alignment: .bottomTrailing) {
            Button {
                hasPermissions = true
            } label: {
                HStack(spacing: 8) {
                    Text(NSLocalizedString("page.landing.continue", comment: ""))
                        .font(.system(size: 15, weight: .medium))
                    Image(systemName: "arrow.right")
                        .font(.system(size: 13, weight: .medium))
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color(NSColor.controlAccentColor))
                        .shadow(color: Color.black.opacity(0.1), radius: 4, x: 0, y: 2)
                )
                .foregroundColor(.white)
            }
            .buttonStyle(.plain)
            .padding(32)
        }
    }
    
    // MARK: - 标题区域
    private var titleSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(NSLocalizedString("page.landing.title", comment: ""))
                .font(.system(size: 42, weight: .bold))
                .foregroundColor(Color(NSColor.textColor))
            
            Text("page.landing.subtitle")
                .font(.system(size: 20))
                .foregroundColor(Color(NSColor.secondaryLabelColor))
                .lineSpacing(4)
        }
    }
    
    // MARK: - 权限状态区域
    private var permissionStatusSection: some View {
        VStack(spacing: 16) {
            ForEach(viewModel.permissionStatuses) { status in
                PermissionStatusView(status: status)
            }
        }
        .padding(24)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(NSColor.controlBackgroundColor))
                .shadow(color: Color.black.opacity(0.05), radius: 8, x: 0, y: 2)
        )
    }
    
    // MARK: - 语言选择器
    private var languageSelector: some View {
        Picker("", selection: $language) {
            ForEach(availableLanguages, id: \.0) { code, name in
                Text(name).tag(code)
            }
        }
        .pickerStyle(.menu)
        .frame(width: 120)
    }
}

// MARK: - 权限状态视图
struct PermissionStatusView: View {
    let status: PermissionStatusItem
    
    var body: some View {
        HStack(spacing: 16) {
            // 图标
            Image(systemName: status.iconName)
                .font(.system(size: 24))
                .foregroundColor(status.iconColor)
                .frame(width: 40, height: 40)
                .background(
                    Circle()
                        .fill(status.iconColor.opacity(0.1))
                )
            
            // 文本
            VStack(alignment: .leading, spacing: 4) {
                Text(status.title.localized)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(Color(NSColor.textColor))
                
                Text(status.description.localized)
                    .font(.system(size: 14))
                    .foregroundColor(Color(NSColor.secondaryLabelColor))
                    .lineSpacing(2)
            }
            
            Spacer()
            
            // 状态标签
            if let statusText = status.statusText {
                Text(statusText.localized)
                    .font(.system(size: 12, weight: .medium))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(
                        Capsule()
                            .fill(status.statusColor.opacity(0.1))
                    )
                    .foregroundColor(status.statusColor)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(NSColor.windowBackgroundColor))
        )
    }
}

// MARK: - 预览
struct LandingPageView_Previews: PreviewProvider {
    static var previews: some View {
        LandingPageView(hasPermissions: .constant(false))
    }
} 
