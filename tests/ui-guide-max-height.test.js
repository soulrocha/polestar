'use strict';
// "Automatic height" (ui.maxHeightAuto): the guide window grows into all the
// free room on screen (under its top edge; with Grow upward, over its bottom
// edge) less a margin and the class quest card, and ignores the Maximum height
// slider. Off, nothing changes. Against the real Core + Theme + UI manifests
// and the fake Engine (tests/lua/stub_ui.lua).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runAddon } = require('./helpers/lua');

const PRE = `
uistub.install()
stub.login()
local GF = Polestar.UI.GuideFrame
local CT = Polestar.UI.ClassToast
local F = PolestarGuideFrame
GetSpellTexture = function(id) return "Interface\\\\Icons\\\\spell-" .. id end
Polestar.Compat.GetMapName = function(id) return ({ [1411] = "Durotar", [1454] = "Orgrimmar" })[id] end
IsPlayerSpell = function() return false end
GetItemCount = function() return 0 end
Polestar.Compat.IsQuestCompleted = function() return false end
Polestar.Compat.IsOnQuest = function() return false end
local function G(t, f) f.t = t; return f end
local function q(t, id, title, npc, status) return G(t, { verb = t == "accept" and "Accept" or "Turn in", subject = title, subjectKind = "quest", quest = id, npcName = npc, status = status or "pending" }) end
local function add(g) uistub.guides[g.id] = g; table.insert(uistub.order, g.id) end
add({ id = "test/class/warlock", pack = "guides", title = "Warlock demons", category = "Class", classes = { "WARLOCK" }, minLevel = 1, maxLevel = 30,
	zone = 1411, zoneName = "Durotar", author = "Polestar", version = 1, steps = {
	{ title = "Ophek", goals = { q("accept", 1506, "Gan'rul's Summons", "Ophek") } },
	{ title = "Creature of the Void", goals = { q("turnin", 1506, "Gan'rul's Summons", "Gan'rul Bloodeye") } },
} })
-- A busy step: goals of mixed heights (one wraps), so a fixed scroll step lands mid-row.
local busy = {}
for i = 1, 14 do
	local subject = i % 4 == 0 and ("Scorpid Worker of the long dry gully past the ridge " .. i) or ("Mottled Boar " .. i)
	busy[#busy + 1] = G("kill", { verb = "Kill", subject = subject, subjectKind = "npc", npc = 3098 + i, progress = { cur = 0, max = 8 }, status = i == 12 and "active" or "pending" })
end
add({ id = "test/durotar", pack = "guides", title = "Durotar", faction = "Horde", category = "Leveling", minLevel = 1, maxLevel = 12,
	zone = 1411, zoneName = "Durotar", author = "Polestar", version = 1, steps = { { title = "Valley of Trials", goals = busy } } })
uistub.player.class, uistub.player.race, uistub.player.faction, uistub.player.level = "WARLOCK", "Orc", "Horde", 10
Polestar.Set("ui.wholeStep", true)
Polestar.Set("ui.maxHeight", 0.4)
uistub.setGuide("test/durotar", 1)
stub.advance(1)
local goals = GF.parts.goals
-- Every item top of the goals area, as a set.
local function tops()
	local out = {}
	for _, f in ipairs(GF.CardItems()) do out[#out + 1] = GF.ItemTop(f) end
	return out
end
local function onTop(y)
	for _, t in ipairs(tops()) do if math.abs(t - y) < 0.5 then return true end end
	return false
end
`;

function run(script) {
	return runAddon({
		stubs: ['stub_ui.lua'],
		addons: [{ name: 'Polestar', files: ['Core/Core.xml', 'Theme/Theme.xml', 'UI/UI.xml'] }],
		script: PRE + script,
	}).emitted;
}

// The stub does not lay frames out: pin the window's top edge where the test says.
const TOP = `F.GetTop = function() return 460 end`;

test('off (the default) the slider alone sets the cap, wherever the window stands', () => {
	const [a, b] = run(`
		${TOP}
		emit({ auto = Polestar.Get("ui.maxHeightAuto"), cap = GF.CapHeight(), h = F:GetHeight() })
		Polestar.Set("ui.maxHeight", 0.9)
		emit({ cap = GF.CapHeight() })`);
	assert.equal(a.auto, false);
	assert.equal(a.cap, 432, 'the share of the 1080 px screen, as before');
	assert.equal(b.cap, 972);
});

test('on, the cap is the room under the top edge less the margin, and the slider is ignored', () => {
	const [on, slid, moved, off] = run(`
		${TOP}
		Polestar.Set("ui.maxHeightAuto", true)
		emit({ cap = GF.CapHeight(), h = F:GetHeight(), over = goals.psOver })
		Polestar.Set("ui.maxHeight", 0.9)
		emit({ cap = GF.CapHeight(), h = F:GetHeight() })
		F.GetTop = function() return 700 end
		Polestar.Set("ui.pos", { 100, 700 })
		emit({ cap = GF.CapHeight(), h = F:GetHeight() })
		Polestar.Set("ui.maxHeightAuto", false)
		emit({ cap = GF.CapHeight() })`);
	assert.equal(on.cap, 460 - 24);
	assert.equal(on.over, true, 'the busy step is longer than the room, so it scrolls');
	assert.ok(on.h <= on.cap + 0.5, JSON.stringify(on));
	assert.equal(slid.cap, on.cap, 'the slider changes nothing while Automatic is on');
	assert.equal(moved.cap, 700 - 24, 'moving the window re-measures the room');
	assert.ok(moved.h > on.h + 1, 'and the window takes the room: ' + JSON.stringify([on, moved]));
	assert.equal(off.cap, 972, 'off again, the slider rules');
});

test('with Grow upward the room is the one over the pinned bottom edge', () => {
	const [c] = run(`
		Polestar.Set("ui.maxHeightAuto", true)
		Polestar.Set("ui.growUp", true)
		Polestar.Set("ui.pos", { 100, 200 })
		emit({ cap = GF.CapHeight(), point = (F:GetPoint(1)) })`);
	assert.equal(c.point, 'BOTTOMLEFT');
	assert.equal(c.cap, 1080 - 200 - 24);
});

test('on, the class card still comes off the room', () => {
	const [before, shown, gone] = run(`
		${TOP}
		Polestar.Set("ui.maxHeightAuto", true)
		Polestar.Set("ui.maxHeight", 0.9)
		emit({ h = F:GetHeight(), cap = GF.CapHeight() })
		CT.Show(1506)
		stub.advance(1)
		local _, _, _, _, y = CT.frame:GetPoint(1)
		emit({ h = F:GetHeight(), cap = GF.CapHeight(), card = CT.frame:GetHeight(), y = math.abs(y) })
		CT.frame.Later:Click()
		stub.advance(1)
		emit({ h = F:GetHeight() })`);
	assert.ok(before.h <= before.cap + 0.5, JSON.stringify(before));
	assert.ok(shown.h + shown.y + shown.card <= shown.cap + 0.5, `window, gap and card keep to the room: ${JSON.stringify(shown)}`);
	assert.ok(shown.h < before.h - 0.5, 'the goals give up the room the card takes');
	assert.ok(Math.abs(gone.h - before.h) < 0.5, 'dismissed, the window takes it back');
});

test('a window pinned near the bottom of the screen keeps a floor of 30% of it', () => {
	const [c] = run(`
		F.GetTop = function() return 100 end
		Polestar.Set("ui.maxHeightAuto", true)
		emit({ cap = GF.CapHeight() })`);
	assert.equal(c.cap, 324);
});
