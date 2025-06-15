import SwiftUI

struct TranscribePageView: View {
    @StateObject private var viewModel = TranscribePageViewModel()
    
    var body: some View {
        VStack(spacing: 24) {
            // 标题区域
            titleSection
            
            // 工具栏区域
            toolbarSection
            
            // 转录内容区域
            transcriptionContentSection
        }
        .padding(24) // 页面边距规范
        .frame(minWidth: 800, minHeight: 600)
        .background(Color(NSColor.windowBackgroundColor))
    }
    
    // MARK: - 标题区域
    private var titleSection: some View {
        HStack {
            Text("page.transcribe.title".localized)
                .font(.system(size: 28, weight: .bold)) // H1 标题规范
                .foregroundColor(Color(NSColor.textColor))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    
    // MARK: - 工具栏区域
    private var toolbarSection: some View {
        HStack(spacing: 16) {
            // 语言选择
            Menu {
                ForEach(viewModel.languageOptions, id: \.self) { option in
                    Button(option.localized) {
                        viewModel.selectLanguage(option)
                    }
                }
            } label: {
                HStack {
                    Text("transcribe.language.title".localized)
                    Image(systemName: "chevron.down")
                }
                .font(.system(size: 14)) // Body 文本规范
            }
            .menuStyle(.borderlessButton)
            
            // 模型选择
            Menu {
                ForEach(viewModel.modelOptions, id: \.self) { option in
                    Button(option.localized) {
                        viewModel.selectModel(option)
                    }
                }
            } label: {
                HStack {
                    Text("transcribe.model.title".localized)
                    Image(systemName: "chevron.down")
                }
                .font(.system(size: 14)) // Body 文本规范
            }
            .menuStyle(.borderlessButton)
            
            Spacer()
            
            // 导出按钮
            Button {
                viewModel.exportTranscription()
            } label: {
                Image(systemName: "square.and.arrow.up")
                    .font(.system(size: 16)) // 操作按钮图标尺寸规范
            }
            .buttonStyle(.borderless)
        }
        .padding(16) // 卡片内边距规范
        .background(Color(NSColor.controlBackgroundColor))
        .cornerRadius(12) // 卡片圆角规范
        .shadow(color: Color.black.opacity(0.1), radius: 8, x: 0, y: 2) // 卡片阴影规范
    }
    
    // MARK: - 转录内容区域
    private var transcriptionContentSection: some View {
        VStack(spacing: 16) {
            // 时间轴
            timelineSection
            
            // 转录文本
            transcriptionTextSection
        }
    }
    
    // MARK: - 时间轴区域
    private var timelineSection: some View {
        VStack(spacing: 8) {
            // 进度条
            ProgressView(value: viewModel.progress)
                .progressViewStyle(.linear)
                .tint(Color(NSColor.controlAccentColor))
            
            // 时间信息
            HStack {
                Text(viewModel.currentTime)
                    .font(.system(size: 12)) // Caption 文本规范
                    .foregroundColor(Color(NSColor.secondaryLabelColor))
                
                Spacer()
                
                Text(viewModel.totalTime)
                    .font(.system(size: 12)) // Caption 文本规范
                    .foregroundColor(Color(NSColor.secondaryLabelColor))
            }
        }
        .padding(16) // 卡片内边距规范
        .background(Color(NSColor.controlBackgroundColor))
        .cornerRadius(12) // 卡片圆角规范
    }
    
    // MARK: - 转录文本区域
    private var transcriptionTextSection: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                ForEach(viewModel.transcriptionSegments) { segment in
                    TranscriptionSegmentView(segment: segment)
                }
            }
            .padding(16) // 卡片内边距规范
        }
        .background(Color(NSColor.controlBackgroundColor))
        .cornerRadius(12) // 卡片圆角规范
    }
}

// MARK: - 转录片段视图
struct TranscriptionSegmentView: View {
    let segment: TranscriptionSegment
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // 时间戳
            Text(segment.formattedTime)
                .font(.system(size: 12)) // Caption 文本规范
                .foregroundColor(Color(NSColor.secondaryLabelColor))
            
            // 文本内容
            Text(segment.text)
                .font(.system(size: 14)) // Body 文本规范
                .foregroundColor(Color(NSColor.textColor))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - 预览
struct TranscribePageView_Previews: PreviewProvider {
    static var previews: some View {
        TranscribePageView()
    }
} 