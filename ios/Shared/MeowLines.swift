import Foundation

/// Rotating break messages, ported verbatim from the Chrome extension
/// (content.js — BREAK_MEOW_QUOTES).
enum MeowLines {
    static let all: [String] = [
        "Meow — your scroll paw needs a rest.",
        "Gentle head-bonk: that is enough pixels for now.",
        "This cat says stretch, hydrate, and blink away from the tab.",
        "Purr-haps it is time to stand up and meander?",
        "The internet will still be here in a few minutes.",
        "Mrrp. Something besides this screen misses you.",
        "Even curiosity needed a nap. You are next.",
        "Champion of focus — now try champion of breathing room.",
        "Soft meow, loud hint: break time.",
        "Treat yourself to real sky, not just the loading kind.",
        "Boop. Your human eyes deserve a different focal length.",
        "The tab can wait; your spine cannot. Meow.",
        "One polite paw on the keyboard means: pause.",
        "Whiskers sense you have earned a stretch intermission.",
        "This is not goodbye to the site — just a tiny cat ceasefire.",
        "Keyboard warmth is lovely; fresh air is lovelier. Mrr.",
        "Your thumbs did great. Now let them loaf.",
        "Nine lives, one back — stand up like you mean it.",
        "Fur real: a two-minute wander beats a doom-scroll spiral.",
        "Tail says sideways — that means take five, friend."
    ]

    static func random() -> String {
        all.randomElement() ?? all[0]
    }
}
