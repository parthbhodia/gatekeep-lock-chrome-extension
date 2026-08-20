import Foundation
import SwiftUI
import UIKit
import FamilyControls
import ManagedSettings
import DeviceActivity

/// A greeting takeover triggered by the Shortcuts automation deep link
/// (catbreak://break?return=instagram).
struct TakeoverRequest: Identifiable {
    let id = UUID()
    /// Where "Continue" heads back to (e.g. instagram://), if provided.
    let returnURL: URL?
}

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
    @Published var takeover: TakeoverRequest?

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
        // Bake keyed shield stills in the background so the shield shows a
        // real cat instead of the bundled icon (see ShieldCatBaker).
        let current = videos
        Task.detached(priority: .utility) {
            await ShieldCatBaker.bakeMissingFrames(for: current)
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

    /// Handles catbreak://break?return=<scheme> from the greeting automation.
    func handleDeepLink(_ url: URL) {
        guard url.scheme?.lowercased() == "catbreak",
              (url.host ?? "").lowercased() == "break" else { return }

        let comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let raw = comps?.queryItems?.first(where: { $0.name == "return" })?.value ?? ""
        let scheme = raw.filter { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "+" || $0 == "." }
        let returnURL = scheme.isEmpty ? nil : URL(string: "\(scheme)://")

        // In-app half of the loop guard (the Shortcuts half is the
        // "Is the cat napping?" action): if the cat is napping, bounce back
        // to the greeted app instead of greeting again.
        if let last = SharedStore.lastTakeoverAt, Date().timeIntervalSince(last) < 180 {
            if let returnURL { UIApplication.shared.open(returnURL) }
            return
        }
        takeover = TakeoverRequest(returnURL: returnURL)
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
