import SwiftUI
import FamilyControls

/// First-run screen: Cat Break needs Screen Time permission before it can
/// watch limits or shield apps — the iOS equivalent of the extension's
/// tabs/scripting permissions.
struct AuthorizationGate: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(spacing: 20) {
            Text("🐈").font(.system(size: 72))
            Text("Cat Break").font(.largeTitle.bold())
            Text("Spend too long in an app and a cat pads in to suggest a break. To do that, Cat Break needs Screen Time access — everything stays on your device.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .padding(.horizontal)

            Button {
                Task { await model.requestAuthorization() }
            } label: {
                Text("Allow Screen Time access")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.orange)
            .padding(.horizontal)

            if model.authorizationStatus == .denied {
                Text("Access was declined. You can grant it later in Settings → Screen Time.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
        .padding()
    }
}
