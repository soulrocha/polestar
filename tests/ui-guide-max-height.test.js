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
		Polestar.Set("ui.maxHeight", 0.9)
		Polestar.Set("ui.maxHeightAuto", true)
		emit({ cap = GF.CapHeight(), h = F:GetHeight(), over = goals.psOver })
		emit({ cap = GF.CapHeight(), h = F:GetHeight() })
		F.GetTop = function() return 700 end
		Polestar.Set("ui.pos", { 100, 700 })
		emit({ cap = GF.CapHeight(), h = F:GetHeight() })
		Polestar.Set("ui.maxHeightAuto", false)
		emit({ cap = GF.CapHeight() })`);
	assert.equal(on.cap, 460 - 24);
	assert.equal(on.over, true, 'the busy step is longer than the room, so it scrolls');
	assert.ok(on.h <= on.cap + 0.5, JSON.stringify(on));
	assert.equal(slid.cap, on.cap, 'the stored slider value (90%) is ignored while Automatic is on');
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
		Polestar.Set("ui.maxHeight", 0.9)
		Polestar.Set("ui.maxHeightAuto", true)
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

// The grip at the window's bottom right: a drag sets the height limit too.
// The cursor y runs up the screen, as in the game.
const DRAG = `
local grip = GF.grip
local function drag(x0, y0, x1, y1)
	stub.cursor = { x0, y0 }
	stub.RunScript(grip, "OnMouseDown", "LeftButton")
	stub.cursor = { x1, y1 }
	stub.RunScript(grip, "OnUpdate", 0)
end
local function drop() stub.RunScript(grip, "OnMouseUp", "LeftButton") end
`;

test('dragging the grip down sets the limit by how far it moved, the top edge pinned, and the line shows it', () => {
	const [mid, done] = run(`${DRAG}
		drag(500, 600, 500, 500)
		local line = GF.limitLine
		emit({ max = Polestar.Get("ui.maxHeight"), cap = GF.CapHeight(), line = line:IsShown(), text = line.Text:GetText() })
		drop()
		emit({ line = line:IsShown(), max = Polestar.Get("ui.maxHeight") })`);
	assert.equal(mid.cap, 532, 'the 432 px limit grew by the 100 px drag');
	assert.ok(Math.abs(mid.max - 532 / 1080) < 1e-6, JSON.stringify(mid));
	assert.equal(mid.line, true);
	assert.equal(mid.text, '532 px');
	assert.equal(done.line, false, 'the line goes away on release');
	assert.ok(Math.abs(done.max - 532 / 1080) < 1e-6, 'and the limit stays');
});

test('with Grow upward the limit grows by dragging up, and the line sits over the pinned bottom edge', () => {
	const [c] = run(`${DRAG}
		Polestar.Set("ui.growUp", true)
		Polestar.Set("ui.pos", { 100, 200 })
		drag(500, 600, 500, 700)
		local _, _, _, _, y = GF.limitLine:GetPoint(1)
		emit({ cap = GF.CapHeight(), point = (GF.limitLine:GetPoint(1)), y = y })
		drop()
		drag(500, 600, 500, 500)
		emit({ cap = GF.CapHeight() })
		drop()`);
	assert.equal(c.cap, 532);
	assert.equal(c.point, 'BOTTOMLEFT');
	assert.equal(c.y, 532);
});

test('the limit stays between 30% and 100% of the screen', () => {
	const [lo, hi] = run(`${DRAG}
		drag(500, 600, 500, 900)
		emit({ max = Polestar.Get("ui.maxHeight") })
		drop()
		drag(500, 600, 500, -900)
		emit({ max = Polestar.Get("ui.maxHeight") })
		drop()`);
	assert.equal(lo.max, 0.3);
	assert.equal(hi.max, 1);
});

test('only a vertical drag changes the limit; a sideways one leaves the default as it was', () => {
	const [c] = run(`${DRAG}
		drag(500, 600, 560, 601)
		emit({ max = Polestar.Get("ui.maxHeight"), w = F:GetWidth() })
		drop()`);
	assert.equal(c.max, 0.4);
	assert.ok(c.w > 340, 'the width still follows: ' + c.w);
});

test('a vertical drag or the slider turns Automatic off; a sideways drag does not', () => {
	const [side, vert, slider] = run(`${DRAG}
		${TOP}
		Polestar.Set("ui.maxHeightAuto", true)
		drag(500, 600, 560, 600)
		emit({ auto = Polestar.Get("ui.maxHeightAuto") })
		drop()
		drag(500, 600, 500, 500)
		emit({ auto = Polestar.Get("ui.maxHeightAuto"), cap = GF.CapHeight(), max = Polestar.Get("ui.maxHeight") })
		drop()
		Polestar.Set("ui.maxHeightAuto", true)
		Polestar.Set("ui.maxHeight", 0.7)
		emit({ auto = Polestar.Get("ui.maxHeightAuto"), cap = GF.CapHeight() })`);
	assert.equal(side.auto, true);
	assert.equal(vert.auto, false);
	assert.equal(vert.cap, 460 - 24 + 100, 'it starts from the room Automatic had');
	assert.equal(slider.auto, false);
	assert.equal(slider.cap, 756, 'the slider value rules once Automatic is off');
});

test('Lock window locks the height drag too', () => {
	const [c] = run(`${DRAG}
		Polestar.Set("ui.locked", true)
		drag(500, 600, 500, 400)
		emit({ max = Polestar.Get("ui.maxHeight"), line = GF.limitLine and GF.limitLine:IsShown() or false, grip = GF.grip:IsShown() })`);
	assert.equal(c.max, 0.4);
	assert.equal(c.line, false);
	assert.equal(c.grip, false);
});
