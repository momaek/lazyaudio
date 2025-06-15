import Foundation
import SwiftUI

class AppState: ObservableObject {
    @Published var locale: Locale {
        didSet {
            UserDefaults.standard.set([locale.identifier], forKey: "AppleLanguages")
            UserDefaults.standard.synchronize()
        }
    }
    
    init() {
        // 默认使用系统语言
        self.locale = Locale.current
    }
    
    func setLocale(_ identifier: String) {
        locale = Locale(identifier: identifier)
    }
} 