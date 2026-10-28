import UIKit
import UniformTypeIdentifiers

// "Paylaş… → Butika" penceresi. Instagram'dan (ya da Safari'den) paylaşılan linki Butika
// sunucusuna gönderir: butik Butika'daysa kullanıcının butiklerine eklenir, kullanıcı
// paylaştığı uygulamadan hiç çıkmaz. Oturum anahtarları uygulamayla ortak anahtarlıktan
// okunur (src/lib/storage.ts → ORTAK_ANAHTARLIK).
final class ShareViewController: UIViewController {
  private let anahtarlikGrubu = "267U2P4925.app.butika.ortak"
  // expo-secure-store'un servis adı (requireAuthentication kapalıyken "app:no-auth").
  private let servis = "app:no-auth"
  private let varsayilanSunucu = "https://api.butika.ai"

  private let kart = UIView()
  private let logo = UILabel()
  private let gorsel = UIImageView()
  private let baslik = UILabel()
  private let aciklama = UILabel()
  private let yukleniyor = UIActivityIndicatorView(style: .medium)
  private let tamam = UIButton(type: .system)

  private let krem = UIColor(red: 0xF8 / 255, green: 0xF5 / 255, blue: 0xF0 / 255, alpha: 1)
  private let murekkep = UIColor(red: 0x0A / 255, green: 0x0A / 255, blue: 0x0A / 255, alpha: 1)
  private let bordo = UIColor(red: 0x56 / 255, green: 0x1C / 255, blue: 0x2A / 255, alpha: 1)

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = UIColor.black.withAlphaComponent(0.25)
    kur()
    durum(baslik: "Kaydediliyor…", aciklama: nil, bitti: false)
    Task { await paylasimiIsle() }
  }

  // MARK: - Görünüm

  private func kur() {
    kart.backgroundColor = krem
    kart.layer.cornerRadius = 20
    kart.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(kart)

    logo.text = "B U T I K A"
    logo.font = .systemFont(ofSize: 12, weight: .semibold)
    logo.textColor = bordo

    gorsel.contentMode = .scaleAspectFill
    gorsel.clipsToBounds = true
    gorsel.layer.cornerRadius = 10
    gorsel.backgroundColor = UIColor(white: 0.9, alpha: 1)
    gorsel.isHidden = true

    baslik.font = UIFont(name: "Georgia", size: 22) ?? .systemFont(ofSize: 22)
    baslik.textColor = murekkep
    baslik.numberOfLines = 2
    baslik.textAlignment = .center

    aciklama.font = .systemFont(ofSize: 15)
    aciklama.textColor = UIColor(red: 0x6B / 255, green: 0x65 / 255, blue: 0x60 / 255, alpha: 1)
    aciklama.numberOfLines = 0
    aciklama.textAlignment = .center

    yukleniyor.color = murekkep

    tamam.setTitle("TAMAM", for: .normal)
    tamam.titleLabel?.font = .systemFont(ofSize: 14, weight: .semibold)
    tamam.setTitleColor(krem, for: .normal)
    tamam.backgroundColor = murekkep
    tamam.layer.cornerRadius = 6
    tamam.contentEdgeInsets = UIEdgeInsets(top: 14, left: 24, bottom: 14, right: 24)
    tamam.addTarget(self, action: #selector(kapat), for: .touchUpInside)
    tamam.isHidden = true

    let yigin = UIStackView(arrangedSubviews: [logo, gorsel, yukleniyor, baslik, aciklama, tamam])
    yigin.axis = .vertical
    yigin.alignment = .center
    yigin.spacing = 12
    yigin.translatesAutoresizingMaskIntoConstraints = false
    kart.addSubview(yigin)

    NSLayoutConstraint.activate([
      kart.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
      kart.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
      kart.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -16),
      yigin.topAnchor.constraint(equalTo: kart.topAnchor, constant: 24),
      yigin.bottomAnchor.constraint(equalTo: kart.bottomAnchor, constant: -24),
      yigin.leadingAnchor.constraint(equalTo: kart.leadingAnchor, constant: 20),
      yigin.trailingAnchor.constraint(equalTo: kart.trailingAnchor, constant: -20),
      gorsel.widthAnchor.constraint(equalToConstant: 72),
      gorsel.heightAnchor.constraint(equalToConstant: 72),
      tamam.widthAnchor.constraint(equalTo: yigin.widthAnchor),
    ])
  }

  @MainActor
  private func durum(baslik metin: String, aciklama alt: String?, bitti: Bool, otomatikKapat: Bool = false) {
    baslik.text = metin
    aciklama.text = alt
    aciklama.isHidden = alt == nil
    yukleniyor.isHidden = bitti
    if bitti { yukleniyor.stopAnimating() } else { yukleniyor.startAnimating() }
    tamam.isHidden = !bitti || otomatikKapat
    if otomatikKapat {
      DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) { [weak self] in self?.kapat() }
    }
  }

  @objc private func kapat() {
    extensionContext?.completeRequest(returningItems: nil)
  }

  // MARK: - Paylaşım

  private func paylasimiIsle() async {
    guard let metin = await paylasilanMetin() else {
      await durum(baslik: "Link bulunamadı", aciklama: "Bir butiğin Instagram profilini ya da sitesini paylaş.", bitti: true)
      return
    }
    guard oku("accessToken") != nil || oku("refreshToken") != nil else {
      await durum(baslik: "Önce giriş yap", aciklama: "Butika uygulamasını açıp giriş yaptıktan sonra buradan kaydedebilirsin.", bitti: true)
      return
    }
    do {
      let yanit = try await gonder(metin: metin)
      await sonucuGoster(yanit)
    } catch YanitHatasi.oturumYok {
      await durum(baslik: "Önce giriş yap", aciklama: "Butika uygulamasını açıp giriş yaptıktan sonra buradan kaydedebilirsin.", bitti: true)
    } catch {
      await durum(baslik: "Kaydedilemedi", aciklama: "Bağlantını kontrol edip tekrar dene.", bitti: true)
    }
  }

  private func paylasilanMetin() async -> String? {
    let ogeler = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
    var parcalar: [String] = []
    for oge in ogeler {
      for ek in oge.attachments ?? [] {
        if ek.hasItemConformingToTypeIdentifier(UTType.url.identifier),
           let url = try? await ek.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL {
          parcalar.append(url.absoluteString)
        } else if ek.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
                  let yazi = try? await ek.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String {
          parcalar.append(yazi)
        }
      }
      if let yazi = oge.attributedContentText?.string, !yazi.isEmpty { parcalar.append(yazi) }
    }
    let metin = parcalar.joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)
    return metin.isEmpty ? nil : String(metin.prefix(2000))
  }

  private struct Yanit: Decodable {
    struct Butik: Decodable {
      let name: String
      let coverImageUrl: String?
      let logoUrl: String?
    }
    struct Urun: Decodable {
      let title: String
      let imageUrl: String?
    }
    let durum: String
    let butik: Butik?
    let hesap: String?
    let urun: Urun?
    let butikYeni: Bool?
  }

  private enum YanitHatasi: Error { case oturumYok, sunucu }

  private func gonder(metin: String) async throws -> Yanit {
    let sunucu = oku("apiUrl") ?? varsayilanSunucu
    func istek(_ anahtar: String?) async throws -> (Data, Int) {
      var r = URLRequest(url: URL(string: "\(sunucu)/kayitli-butikler/paylasim")!)
      r.httpMethod = "POST"
      r.setValue("application/json", forHTTPHeaderField: "Content-Type")
      if let anahtar { r.setValue("Bearer \(anahtar)", forHTTPHeaderField: "Authorization") }
      r.httpBody = try JSONSerialization.data(withJSONObject: ["metin": metin])
      r.timeoutInterval = 30
      let (veri, yanit) = try await URLSession.shared.data(for: r)
      return (veri, (yanit as? HTTPURLResponse)?.statusCode ?? 0)
    }
    var (veri, kod) = try await istek(oku("accessToken"))
    if kod == 401 {
      guard let yeni = try await yenile(sunucu: sunucu) else { throw YanitHatasi.oturumYok }
      (veri, kod) = try await istek(yeni)
    }
    if kod == 401 { throw YanitHatasi.oturumYok }
    guard (200..<300).contains(kod) else { throw YanitHatasi.sunucu }
    return try JSONDecoder().decode(Yanit.self, from: veri)
  }

  /// Süresi dolan erişim anahtarını yeniler; uygulama da yeni anahtarları ortak anahtarlıktan okur.
  private func yenile(sunucu: String) async throws -> String? {
    guard let yenileme = oku("refreshToken") else { return nil }
    var r = URLRequest(url: URL(string: "\(sunucu)/auth/refresh")!)
    r.httpMethod = "POST"
    r.setValue("application/json", forHTTPHeaderField: "Content-Type")
    r.httpBody = try JSONSerialization.data(withJSONObject: ["refreshToken": yenileme])
    let (veri, yanit) = try await URLSession.shared.data(for: r)
    guard (yanit as? HTTPURLResponse)?.statusCode == 200,
          let json = try JSONSerialization.jsonObject(with: veri) as? [String: Any],
          let erisim = json["accessToken"] as? String,
          let yeniYenileme = json["refreshToken"] as? String else { return nil }
    yaz("accessToken", erisim)
    yaz("refreshToken", yeniYenileme)
    return erisim
  }

  @MainActor
  private func sonucuGoster(_ y: Yanit) {
    switch y.durum {
    case "urun_kaydedildi":
      let butikAdi = y.butik?.name ?? "Butik"
      gorselYukle(y.urun?.imageUrl ?? y.butik?.logoUrl ?? y.butik?.coverImageUrl)
      let alt = y.butikYeni == true
        ? "Profil'de. \(butikAdi) da Butiklerim'e eklendi; Butika ekibi inceledikten sonra vitrinde görünecek."
        : "\(butikAdi) · Profil'de. Fiyatı düşerse ya da stoğa dönerse haber vereceğiz."
      durum(baslik: "\(y.urun?.title ?? "Ürün") kaydedildi", aciklama: alt, bitti: true, otomatikKapat: true)
    case "kaydedildi", "eklendi":
      let ad = y.butik?.name ?? "Butik"
      gorselYukle(y.butik?.logoUrl ?? y.butik?.coverImageUrl)
      let alt = y.durum == "eklendi"
        ? "Butiklerim'e eklendi. Butika ekibi inceledikten sonra herkesin vitrininde de görünecek."
        : "Butika'da Profil → Butiklerim'de."
      durum(baslik: "\(ad) kaydedildi", aciklama: alt, bitti: true, otomatikKapat: true)
    case "oneri_alindi":
      durum(
        baslik: "Bu hesap henüz Butika'da değil",
        aciklama: "İnceleme için not aldık. Bir butikse Butika'ya eklediğimizde haber vereceğiz.",
        bitti: true
      )
    case "gonderi_yakinda":
      durum(
        baslik: "Ürün kaydı çok yakında",
        aciklama: "Şimdilik butiğin profilini paylaşarak butiği kaydedebilirsin.",
        bitti: true
      )
    case "butik_degil":
      durum(baslik: "Bu bir butik gibi görünmüyor", aciklama: "Butika'ya yalnız ürün satan butikler eklenebiliyor.", bitti: true)
    case "site_yok":
      durum(
        baslik: "Web sitesi bulunamadı",
        aciklama: "Bu hesabın profilinde bir web sitesi yok. Butiğin sitesini paylaşarak da ekleyebilirsin.",
        bitti: true
      )
    default:
      durum(baslik: "Link tanınmadı", aciklama: "Bir butiğin Instagram profilini ya da sitesini paylaş.", bitti: true)
    }
  }

  @MainActor
  private func gorselYukle(_ adres: String?) {
    guard let adres, let url = URL(string: adres) else { return }
    gorsel.isHidden = false
    Task {
      if let (veri, _) = try? await URLSession.shared.data(from: url) { gorsel.image = UIImage(data: veri) }
    }
  }

  // MARK: - Ortak anahtarlık (expo-secure-store ile aynı biçim)

  private func sorgu(_ anahtar: String) -> [String: Any] {
    let hesap = Data(anahtar.utf8)
    return [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: servis,
      kSecAttrGeneric as String: hesap,
      kSecAttrAccount as String: hesap,
      kSecAttrAccessGroup as String: anahtarlikGrubu,
    ]
  }

  private func oku(_ anahtar: String) -> String? {
    var q = sorgu(anahtar)
    q[kSecReturnData as String] = true
    q[kSecMatchLimit as String] = kSecMatchLimitOne
    var sonuc: AnyObject?
    guard SecItemCopyMatching(q as CFDictionary, &sonuc) == errSecSuccess, let veri = sonuc as? Data else { return nil }
    return String(data: veri, encoding: .utf8)
  }

  private func yaz(_ anahtar: String, _ deger: String) {
    let veri = Data(deger.utf8)
    let durum = SecItemUpdate(sorgu(anahtar) as CFDictionary, [kSecValueData as String: veri] as CFDictionary)
    if durum == errSecItemNotFound {
      var q = sorgu(anahtar)
      q[kSecValueData as String] = veri
      q[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlocked
      SecItemAdd(q as CFDictionary, nil)
    }
  }
}
