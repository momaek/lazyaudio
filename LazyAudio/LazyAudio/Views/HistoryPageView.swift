import SwiftUI

struct HistoryPageView: View {
    @StateObject private var viewModel = HistoryPageViewModel()
    
    var body: some View {
        VStack(spacing: 24) {
            // 标题区域
            titleSection
            
            // 工具栏区域
            toolbarSection
            
            // 多选工具栏（条件显示）
            if viewModel.selectedItems.count > 0 {
                multiSelectToolbarSection
            }
            
            // 录制列表
            recordingListSection
        }
        .padding(24) // 页面边距规范
        .frame(minWidth: 800, minHeight: 600)
        .background(Color(NSColor.windowBackgroundColor))
    }
    
    // MARK: - 标题区域
    private var titleSection: some View {
        HStack {
            Text("page.history.title".localized)
                .font(.system(size: 28, weight: .bold)) // H1 标题规范
                .foregroundColor(Color(NSColor.textColor))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    
    // MARK: - 工具栏区域
    private var toolbarSection: some View {
        HStack(spacing: 16) {
            // 搜索框
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(Color(NSColor.secondaryLabelColor))
                TextField("history.search.placeholder".localized, text: $viewModel.searchText)
                    .textFieldStyle(.plain)
                    .font(.system(size: 14)) // Body 文本规范
            }
            .padding(.horizontal, 12) // 按钮内边距规范
            .padding(.vertical, 8)
            .background(Color(NSColor.controlBackgroundColor))
            .cornerRadius(8) // 按钮圆角规范
            
            // 筛选按钮
            Menu {
                ForEach(viewModel.filterOptions, id: \.self) { option in
                    Button(option.localized) {
                        viewModel.selectFilter(option)
                    }
                }
            } label: {
                HStack {
                    Text("history.filter".localized)
                    Image(systemName: "chevron.down")
                }
                .font(.system(size: 14)) // Body 文本规范
            }
            .menuStyle(.borderlessButton)
            
            // 排序按钮
            Menu {
                ForEach(viewModel.sortOptions, id: \.self) { option in
                    Button(option.localized) {
                        viewModel.selectSort(option)
                    }
                }
            } label: {
                HStack {
                    Text("history.sort".localized)
                    Image(systemName: "chevron.down")
                }
                .font(.system(size: 14)) // Body 文本规范
            }
            .menuStyle(.borderlessButton)
            
            Spacer()
            
            // 导出按钮
            Button {
                viewModel.exportRecordings()
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
    
    // MARK: - 多选工具栏
    private var multiSelectToolbarSection: some View {
        HStack(spacing: 16) {
            Text("history.selected.count".localized(viewModel.selectedItems.count))
                .font(.system(size: 14)) // Body 文本规范
                .foregroundColor(Color(NSColor.secondaryLabelColor))
            
            Spacer()
            
            Button("history.batch.export".localized) {
                viewModel.exportSelected()
            }
            .buttonStyle(.bordered)
            .font(.system(size: 14)) // Body 文本规范
            
            Button("history.batch.delete".localized) {
                viewModel.deleteSelected()
            }
            .buttonStyle(.bordered)
            .tint(.red)
            .font(.system(size: 14)) // Body 文本规范
            
            Button("history.batch.process".localized) {
                viewModel.processSelected()
            }
            .buttonStyle(.bordered)
            .font(.system(size: 14)) // Body 文本规范
        }
        .padding(16) // 卡片内边距规范
        .background(Color(NSColor.controlBackgroundColor))
        .cornerRadius(12) // 卡片圆角规范
        .shadow(color: Color.black.opacity(0.1), radius: 8, x: 0, y: 2) // 卡片阴影规范
    }
    
    // MARK: - 录制列表
    private var recordingListSection: some View {
        ScrollView {
            LazyVStack(spacing: 16) {
                ForEach(viewModel.filteredRecordings) { item in
                    RecordingItemView(
                        item: item,
                        isSelected: viewModel.selectedItems.contains(item.id),
                        onSelect: { viewModel.toggleSelection(item.id) },
                        onPlay: { viewModel.playRecording(item) },
                        onEdit: { viewModel.editRecording(item) },
                        onDelete: { viewModel.deleteRecording(item) }
                    )
                }
            }
        }
    }
}

// MARK: - 录制项目视图
struct RecordingItemView: View {
    let item: RecordingItem
    let isSelected: Bool
    let onSelect: () -> Void
    let onPlay: () -> Void
    let onEdit: () -> Void
    let onDelete: () -> Void
    
    @State private var isHovered = false
    
    var body: some View {
        HStack(spacing: 16) {
            // 选择框
            if isHovered || isSelected {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundColor(isSelected ? Color(NSColor.controlAccentColor) : Color(NSColor.secondaryLabelColor))
                    .font(.system(size: 16)) // 操作按钮图标尺寸规范
                    .onTapGesture(perform: onSelect)
            }
            
            // 内容区域
            VStack(alignment: .leading, spacing: 8) {
                // 标题
                Text(item.title)
                    .font(.system(size: 16, weight: .medium)) // H3 标题规范
                    .foregroundColor(Color(NSColor.textColor))
                
                // 信息行
                HStack {
                    Text(item.formattedDate)
                    Text("|")
                    Text(item.formattedDuration)
                    Text("|")
                    Text(item.formattedFileSize)
                }
                .font(.system(size: 12)) // Caption 文本规范
                .foregroundColor(Color(NSColor.secondaryLabelColor))
                
                // 状态行
                HStack {
                    Text("history.status.transcription".localized(item.transcriptionStatus.displayText))
                    Text("|")
                    Text("history.status.ai".localized(item.aiProcessingStatus.displayText))
                }
                .font(.system(size: 12)) // Caption 文本规范
                .foregroundColor(Color(NSColor.secondaryLabelColor))
            }
            
            Spacer()
            
            // 操作按钮
            if isHovered || isSelected {
                HStack(spacing: 16) {
                    Button {
                        onPlay()
                    } label: {
                        Image(systemName: "play.circle")
                            .font(.system(size: 16)) // 操作按钮图标尺寸规范
                    }
                    .buttonStyle(.borderless)
                    
                    Button {
                        onEdit()
                    } label: {
                        Image(systemName: "pencil.circle")
                            .font(.system(size: 16)) // 操作按钮图标尺寸规范
                    }
                    .buttonStyle(.borderless)
                    
                    Button {
                        onDelete()
                    } label: {
                        Image(systemName: "trash.circle")
                            .font(.system(size: 16)) // 操作按钮图标尺寸规范
                    }
                    .buttonStyle(.borderless)
                    .tint(.red)
                }
            }
        }
        .padding(16) // 卡片内边距规范
        .background(
            RoundedRectangle(cornerRadius: 12) // 卡片圆角规范
                .fill(isSelected ? Color(NSColor.selectedContentBackgroundColor) : Color(NSColor.controlBackgroundColor))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(isSelected ? Color(NSColor.controlAccentColor) : Color.clear, lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.1), radius: 8, x: 0, y: 2) // 卡片阴影规范
        .onHover { hovering in
            isHovered = hovering
        }
    }
}

// MARK: - 预览
struct HistoryPageView_Previews: PreviewProvider {
    static var previews: some View {
        HistoryPageView()
    }
} 