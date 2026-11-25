import SwiftUI
import FamilyControls

struct RootView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.scenePhase) private var scenePhase

    /// CI/simulator conveniences: `-catbreak-ui-preview` shows the tabs
    /// without Screen Time authorization (which the simulator cannot grant);
    /// `-catbreak-overlay-preview` additionally opens the break overlay, so
    /// CI can screenshot it. Monitoring stays off in both cases.
    private var uiPreview: Bool {
        ProcessInfo.processInfo.arguments.contains("-catbreak-ui-preview")
    }

    @State private var overlayPreview =
        ProcessInfo.processInfo.arguments.contains("-catbreak-overlay-preview")

    var body: some View {
        Group {
            if model.authorizationStatus == .approved || uiPreview {
                TabView {
                    CatTabView()
                        .tabItem { Label("Cat", systemImage: "cat") }
                    SettingsTabView()
                        .tabItem { Label("Settings", systemImage: "gearshape") }
                    StatsTabView()
                        .tabItem { Label("Stats", systemImage: "chart.bar") }
                }
            } else {
                AuthorizationGate()
            }
        }
        .task { await model.refreshVideos() }
        .onChange(of: scenePhase) { phase in
            if phase == .active { model.endExpiredBreakIfNeeded() }
        }
        .onOpenURL { model.handleDeepLink($0) }
        .fullScreenCover(item: $model.takeover) { request in
            CatOverlayView(mode: .greeting(returnURL: request.returnURL))
        }
        .fullScreenCover(isPresented: $overlayPreview) {
            CatOverlayView(mode: .preview)
        }
    }
}
