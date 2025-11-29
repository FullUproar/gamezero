# Cosmic Chaos: Hardware & Network Setup Guide

## Overview

This guide covers the physical hardware and network configuration needed to run Cosmic Chaos in a bar, arcade, or home entertainment setting. The goal is a turnkey setup that boots directly into the game and requires zero maintenance.

---

## 1. Server Hardware Options

### Option A: Raspberry Pi 4 (Budget: ~$100-150)

**Best for:** Home use, small venues, budget-conscious deployment

| Component | Recommendation | Price (approx) |
|-----------|----------------|----------------|
| Board | Raspberry Pi 4 Model B, 4GB RAM (8GB if available) | $55-75 |
| Storage | Samsung EVO 64GB+ microSD or USB 3.0 SSD | $15-40 |
| Power | Official Pi 4 USB-C power supply (5.1V 3A) | $10 |
| Case | Argon ONE M.2 (with SSD) or Flirc aluminum case | $25-50 |
| Cooling | Included with case, or add heatsinks + fan | $5-10 |

**Pros:**
- Cheap and replaceable
- Low power (~15W)
- Silent (fanless options available)
- Small form factor, easy to hide behind TV

**Cons:**
- Limited CPU headroom (may struggle at 10 players with heavy particles)
- SD card can corrupt with improper shutdown
- Requires some Linux comfort

**Performance notes:**
- Node.js runs well on ARM64
- Target 8 players comfortably, 10 with reduced particle effects
- Use SSD boot for reliability (SD cards fail in always-on scenarios)

---

### Option B: Mini PC (Budget: ~$200-400)

**Best for:** Commercial venues, maximum reliability, future-proofing

| Component | Recommendation | Price (approx) |
|-----------|----------------|----------------|
| Unit | Beelink SER5 (Ryzen 5 5560U) or Intel NUC 11 | $250-350 |
| RAM | 16GB (usually included) | — |
| Storage | 256GB+ NVMe SSD (usually included) | — |
| OS | Ubuntu 22.04 LTS or Windows 11 (kiosk mode) | Free/$0 |

**Specific models to consider:**

1. **Beelink SER5 Pro** (~$280)
   - AMD Ryzen 5 5560U (6 cores)
   - 16GB DDR4, 500GB SSD
   - Dual HDMI, WiFi 6
   - Great Linux support

2. **Intel NUC 11 Pro (NUC11TNKi5)** (~$350-400)
   - Intel i5-1135G7 (4 cores, 8 threads)
   - Thunderbolt 4, excellent I/O
   - Proven reliability, business-grade

3. **GMKtec NucBox G3** (~$200)
   - Intel N100 (4 cores)
   - Budget option, sufficient for this workload
   - 8GB RAM, 256GB SSD

**Pros:**
- x86_64 architecture (easier debugging, more packages)
- Plenty of CPU headroom
- Real SSD, no corruption concerns
- Can double as a media PC

**Cons:**
- Higher power draw (~25-45W)
- Larger form factor
- More expensive

---

### Option C: Repurposed Laptop/Desktop (Budget: $0-50)

**Best for:** Prototyping, testing, "I have this lying around"

Any machine from the last 8-10 years with:
- Quad-core CPU
- 4GB+ RAM
- SSD (strongly preferred)
- HDMI output
- WiFi or Ethernet

Old ThinkPads, Dell Optiplex small form factors, or Mac Minis work great. Install Ubuntu and you're off to the races.

---

## 2. Display Hardware

### TV/Monitor Requirements

| Spec | Minimum | Recommended |
|------|---------|-------------|
| Size | 40" | 55"+ |
| Resolution | 1080p | 4K |
| Refresh | 60Hz | 60Hz (game is 60fps capped) |
| Input lag | <30ms | <20ms (game mode) |
| Inputs | 1x HDMI | 2x HDMI (for flexibility) |

**Tips:**
- Enable "Game Mode" on the TV to reduce input lag
- Disable all post-processing (motion smoothing, etc.)
- Commercial displays (like Samsung Business TV) are designed for 24/7 operation
- For bars: consider a display with RS-232 or CEC for remote power control

### Cables

- HDMI 2.0 cable (supports 4K@60Hz)
- Length depends on mounting — get 6ft minimum, 15ft if routing through walls
- For long runs (>25ft), use active HDMI or HDMI over Ethernet extenders

---

## 3. Network Configuration

### Option A: Dedicated Game Network (Recommended for Venues)

This isolates game traffic from the venue's main network and customer WiFi.

```
[Internet] ──► [Venue Router] ──► [Venue WiFi - Customers]
                    │
                    ▼
              [Game Router] ──► [Game Server]
                    │
                    ▼
              [Game WiFi - Controllers]
```

**Hardware:**
- Dedicated router: TP-Link Archer AX21 (~$70) or similar WiFi 6 router
- Set up as a separate subnet (e.g., 192.168.50.x)
- SSID: "COSMIC_CHAOS" or venue-branded name
- Password: Simple for customers (or open with captive portal)

**Router settings:**
- Enable QoS, prioritize the game server IP
- Disable band steering (let 2.4GHz and 5GHz be separate)
- Use 5GHz for game traffic (less interference, lower latency)
- Set channel manually to avoid conflicts with venue WiFi
- Disable WiFi power saving features

### Option B: Existing Venue Network

If you must use the venue's existing WiFi:

- Ensure game server has a **static IP** or DHCP reservation
- Get the server on Ethernet if at all possible (WiFi server = bad)
- Accept that latency will be less predictable
- Test during peak hours before committing

### Network Performance Targets

| Metric | Target | Acceptable |
|--------|--------|------------|
| Ping (phone to server) | <20ms | <50ms |
| Jitter | <10ms | <30ms |
| Packet loss | 0% | <1% |

**Testing:** Use the phone's browser developer tools or a ping app to verify.

---

## 4. Server Software Setup

### For Raspberry Pi (Ubuntu Server 22.04)

```bash
# 1. Flash Ubuntu Server 22.04 LTS (64-bit) to SD/SSD
# Use Raspberry Pi Imager, enable SSH in advanced options

# 2. Boot and connect via SSH
ssh ubuntu@<pi-ip-address>

# 3. Update system
sudo apt update && sudo apt upgrade -y

# 4. Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 5. Install build essentials (for native modules)
sudo apt install -y build-essential

# 6. Clone and build game (once repo exists)
git clone https://github.com/your-repo/cosmic-chaos.git
cd cosmic-chaos
npm install
npm run build

# 7. Install PM2 for process management
sudo npm install -g pm2
pm2 start packages/server/dist/index.js --name cosmic-server
pm2 save
pm2 startup  # Follow instructions to enable on boot
```

### For Mini PC (Ubuntu Desktop 22.04)

Same as above, but you can also run the display client directly:

```bash
# Install Chromium
sudo apt install -y chromium-browser

# Auto-start in kiosk mode (add to startup applications)
chromium-browser --kiosk --disable-infobars --noerrdialogs \
  http://localhost:8080
```

### Display Auto-Start (Kiosk Mode)

Create `/etc/xdg/autostart/cosmic-display.desktop`:

```ini
[Desktop Entry]
Type=Application
Name=Cosmic Chaos Display
Exec=chromium-browser --kiosk --disable-infobars --noerrdialogs --disable-translate --no-first-run http://localhost:8080
X-GNOME-Autostart-enabled=true
```

For a truly headless setup with no desktop environment, use a lightweight display manager like `cage` (Wayland compositor for kiosks).

---

## 5. Physical Installation

### Mounting the Server

**Behind the TV:**
- Use VESA mount adapter with shelf
- Ensure ventilation (don't enclose completely)
- Secure cables with clips to prevent accidental disconnection

**In AV cabinet:**
- Ensure adequate airflow
- Use Ethernet if WiFi signal is weak inside cabinet
- Consider USB extension for easier access to ports

**Exposed (arcade style):**
- Custom enclosure with the game branding
- Add physical power button for staff
- Consider locking enclosure to prevent tampering

### Power Considerations

- Use a UPS (uninterruptible power supply) for clean shutdown on power loss
- APC Back-UPS 450VA (~$60) is sufficient for Pi or mini PC
- Configure auto-shutdown on UPS battery signal:

```bash
sudo apt install apcupsd
# Configure /etc/apcupsd/apcupsd.conf for your UPS model
```

### Signage

Print and display:
1. QR code linking to controller URL
2. Room code (or "shown on screen")
3. Brief instructions: "Scan to play! Use joystick to move, big button to fire."

---

## 6. Recommended Configurations

### Home/Casual Setup (~$150)

| Item | Choice |
|------|--------|
| Server | Raspberry Pi 4 (4GB) with Argon case |
| Storage | 128GB USB SSD |
| Display | Existing TV |
| Network | Home WiFi (5GHz) |
| Total | ~$100-150 |

### Bar/Small Venue (~$500)

| Item | Choice |
|------|--------|
| Server | Beelink SER5 Pro |
| Display | 55" commercial TV (LG or Samsung) |
| Network | Dedicated TP-Link AX router |
| UPS | APC Back-UPS 450VA |
| Mounting | VESA shelf behind TV |
| Total | ~$450-550 (assuming TV exists) |

### Arcade/High-Traffic (~$800+)

| Item | Choice |
|------|--------|
| Server | Intel NUC 11 Pro |
| Display | 65"+ commercial display |
| Network | Ubiquiti UniFi AP for reliability |
| UPS | CyberPower 850VA |
| Enclosure | Custom branded cabinet |
| Total | ~$700-900+ |

---

## 7. Troubleshooting

### "Controllers can't connect"

1. Verify phones are on the game WiFi network
2. Check server is running: `pm2 status`
3. Verify firewall allows port 3000: `sudo ufw allow 3000`
4. Test WebSocket connection: open `http://<server-ip>:3000` in browser

### "Game is laggy"

1. Check WiFi signal strength on phones
2. Switch to 5GHz band
3. Reduce player count or particle effects
4. Check server CPU: `htop` — if pegged, optimize or upgrade hardware

### "Display shows black screen"

1. Check HDMI connection and TV input
2. Verify Chromium is running: `ps aux | grep chromium`
3. Check display URL is correct
4. Look for JavaScript errors in Chromium console (F12)

### "Server crashes on boot"

1. Check PM2 logs: `pm2 logs cosmic-server`
2. Verify Node.js version: `node --version` (should be 18+)
3. Check for port conflicts: `sudo lsof -i :3000`

---

## 8. Maintenance

### Daily (if in commercial use)
- Visual check that game is running
- Verify QR code is visible and scannable

### Weekly
- Reboot server (can automate with cron)
- Check disk space: `df -h`
- Review PM2 logs for errors

### Monthly
- Update system: `sudo apt update && sudo apt upgrade`
- Update game code if new version available
- Test with multiple phones

### Quarterly
- Clean dust from server vents
- Verify UPS battery health
- Review network performance

---

## 9. Parts List & Links

### Raspberry Pi Setup

- [Raspberry Pi 4 8GB](https://www.raspberrypi.com/products/raspberry-pi-4-model-b/) — $75
- [Argon ONE M.2 Case](https://argon40.com/products/argon-one-m-2-case-for-raspberry-pi-4) — $45
- [Samsung 870 EVO 250GB](https://www.samsung.com/us/computing/memory-storage/solid-state-drives/870-evo-sata-2-5-ssd-250gb-mz-77e250b-am/) — $40
- [Official USB-C Power Supply](https://www.raspberrypi.com/products/type-c-power-supply/) — $10

### Mini PC Setup

- [Beelink SER5 Pro](https://www.bee-link.com/products/beelink-ser5-pro) — $280
- [Intel NUC 11 Pro](https://www.intel.com/content/www/us/en/products/details/nuc.html) — $350+

### Networking

- [TP-Link Archer AX21](https://www.tp-link.com/us/home-networking/wifi-router/archer-ax21/) — $70
- [Ubiquiti UniFi 6 Lite](https://store.ui.com/collections/unifi-network-wireless/products/u6-lite-us) — $100

### Power

- [APC Back-UPS 450VA](https://www.apc.com/us/en/product/BE450G/) — $60
- [CyberPower 850VA](https://www.cyberpowersystems.com/product/ups/battery-backup/cp850pfclcd/) — $120

---

## Quick Start Checklist

- [ ] Choose hardware tier based on venue needs
- [ ] Acquire server, display, and network gear
- [ ] Set up dedicated WiFi network (recommended)
- [ ] Install Ubuntu on server
- [ ] Install Node.js and PM2
- [ ] Deploy game code
- [ ] Configure kiosk mode for display
- [ ] Test with 2+ phones
- [ ] Print QR code signage
- [ ] Document local IP addresses for venue staff
- [ ] Set up UPS and auto-shutdown (optional but recommended)

---

You're ready to rock. 🎮
