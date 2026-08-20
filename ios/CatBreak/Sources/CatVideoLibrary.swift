import Foundation

struct CatVideo: Identifiable, Equatable {
    let file: String

    var id: String { file }

    /// "cat-morning-paws.mp4" → "Morning Paws" (ported from popup.js fileToLabel).
    var label: String {
        file
            .replacingOccurrences(of: ".mp4", with: "")
            .replacingOccurrences(of: "cat-", with: "")
            .split(separator: "-")
            .map { $0.prefix(1).uppercased() + $0.dropFirst() }
            .joined(separator: " ")
    }

    var url: URL {
        URL(string: CatVideoLibrary.supabaseBase + file)!
    }
}

/// Same Supabase bucket the Chrome extension streams from (see background.js).
enum CatVideoLibrary {
    static let supabaseBase = "https://pozytitruvcthhfvpqic.supabase.co/storage/v1/object/public/cat-videos/"
    static let listURL = URL(string: "https://pozytitruvcthhfvpqic.supabase.co/storage/v1/object/list/cat-videos")!
    // Publishable (anon) key — safe to ship in client code, read-only access only
    static let anonKey = "sb_publishable__RWZ07cSXRVJsMRnNoUjww_rGfM1dB6"

    static let fallbackVideos: [CatVideo] = [
        "cat-alley-amble.mp4",
        "cat-curious-stroll.mp4",
        "cat-elegant-steps.mp4",
        "cat-garden-stroll.mp4",
        "cat-lazy-stretch.mp4",
        "cat-morning-paws.mp4",
        "cat-street-strut.mp4",
        "cat-twilight-prowl.mp4",
        "cat-window-watcher.mp4"
    ].map(CatVideo.init)

    /// Live list from Supabase Storage, falling back to the bundled list when
    /// offline — mirrors fetchLiveVideoList() in background.js.
    static func fetchVideos() async -> [CatVideo] {
        var request = URLRequest(url: listURL)
        request.httpMethod = "POST"
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["prefix": "", "limit": 200])

        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let items = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        else { return fallbackVideos }

        let files = items
            .compactMap { $0["name"] as? String }
            .filter { $0.range(of: #"^cat-[a-z0-9-]+\.mp4$"#, options: .regularExpression) != nil }
            .sorted()
        return files.isEmpty ? fallbackVideos : files.map(CatVideo.init)
    }
}
