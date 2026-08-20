import Foundation
import SwiftUI
import FamilyControls
import ManagedSettings
import DeviceActivity

/// Source of truth for the UI; persists to the shared App Group store and
/// reschedules monitoring whenever something relevant changes — the role
/// popup.js + chrome.storage played in the extension.
@MainActor
final class AppModel: ObservableObject {
    @Published var settings: CatBreakSettings { didSet { persist() } }
    @Published var selection: FamilyActivitySelection { didSet { persist() } }
    @Published var authorizationStatus: AuthorizationStatus = .notDetermined
    @Published var videos: [CatVideo] = CatVideoLibrary.fallbackVideos
    @Published var scheduleError: String?

    init() {
        settings = SharedStore.loadSettings()
        selection = SharedStore.loadSelection()
        authorizationStatus = AuthorizationCenter.shared.authorizationStatus
        endExpiredBreakIfNeeded()
    }

    func requestAuthorization() async {
        do {
            try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
        } catch {
            // Denied or failed — the gate view reflects the status either way.
        }
        authorizationStatus = AuthorizationCenter.shared.authorizationStatus
        if authorizationStatus == .approved {
            try? MonitorScheduler.refreshMonitoring()
        }
    }

    func refreshVideos() async {
        videos = await CatVideoLibrary.fetchVideos()
        if !videos.contains(where: { $0.file == settings.catVideoFile }),
           let first = videos.first {
            settings.catVideoFile = first.file
        }
    }

    /// Belt and suspenders: breaks shorter than DeviceActivity's 15-minute
    /// scheduling floor can't auto-end, so lift an elapsed one whenever the
    /// app comes to the foreground.
    func endExpiredBreakIfNeeded() {
        if let end = SharedStore.breakEndsAt, end <= Date() {
            ShieldController.liftAll()
            try? MonitorScheduler.refreshMonitoring()
        }
    }

    /// The popup's "Shoo" button: lift any active cat and re-arm the limits.
    func shooNow() {
        ShieldController.liftAll()
        try? MonitorScheduler.refreshMonitoring()
    }

    private func persist() {
        SharedStore.save(settings)
        SharedStore.save(selection)
        guard authorizationStatus == .approved else { return }
        do {
            try MonitorScheduler.refreshMonitoring()
            scheduleError = nil
        } catch {
            scheduleError = "Could not schedule monitoring: \(error.localizedDescription)"
        }
    }
}
