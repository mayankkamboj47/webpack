/* globals describe, it */
"use strict";

const path = require("path");

const webpack = require("..");
const Stats = require("../lib/Stats");
const WebpackOptionsDefaulter = require("../lib/WebpackOptionsDefaulter");
const MemoryFs = require("memory-fs");

describe("Compiler", () => {
	jest.setTimeout(20000);
	function compile(entry, options, callback) {
		const noOutputPath = !options.output || !options.output.path;
		if (!options.mode) options.mode = "production";
		options = new WebpackOptionsDefaulter().process(options);
		options.entry = entry;
		options.context = path.join(__dirname, "fixtures");
		if (noOutputPath) options.output.path = "/";
		options.output.pathinfo = true;
		options.optimization = {
			minimize: false
		};
		const logs = {
			mkdir: [],
			writeFile: []
		};

		const c = webpack(options);
		const files = {};
		c.outputFileSystem = {
			mkdir(path, callback) {
				logs.mkdir.push(path);
				const err = new Error();
				err.code = "EEXIST";
				callback(err);
			},
			writeFile(name, content, callback) {
				logs.writeFile.push(name, content);
				files[name] = content.toString("utf-8");
				callback();
			}
		};
		c.hooks.compilation.tap(
			"CompilerTest",
			compilation => (compilation.bail = true)
		);
		c.run((err, stats) => {
			if (err) throw err;
			expect(typeof stats).toBe("object");
			const compilation = stats.compilation;
			stats = stats.toJson({
				modules: true,
				reasons: true
			});
			expect(typeof stats).toBe("object");
			expect(stats).toHaveProperty("errors");
			expect(Array.isArray(stats.errors)).toBe(true);
			if (stats.errors.length > 0) {
				expect(stats.errors[0]).toBeInstanceOf(Error);
				throw stats.errors[0];
			}
			stats.logs = logs;
			callback(stats, files, compilation);
		});
	}

	it("should compile a single file to deep output", done => {
		compile(
			"./c",
			{
				output: {
					path: "/what",
					filename: "the/hell.js"
				}
			},
			(stats, files) => {
				expect(stats.logs.mkdir).toEqual(["/what", "/what/the"]);
				done();
			}
		);
	});

	it("should compile a single file", done => {
		compile("./c", {}, (stats, files) => {
			expect(Object.keys(files)).toEqual(["/main.js"]);
			const bundle = files["/main.js"];
			expect(bundle).toMatch("function __webpack_require__(");
			expect(bundle).toMatch(/__webpack_require__\(\/\*! \.\/a \*\/ \w+\);/);
			expect(bundle).toMatch("./c.js");
			expect(bundle).toMatch("./a.js");
			expect(bundle).toMatch("This is a");
			expect(bundle).toMatch("This is c");
			expect(bundle).not.toMatch("2: function(");
			expect(bundle).not.toMatch("window");
			expect(bundle).not.toMatch("jsonp");
			expect(bundle).not.toMatch("fixtures");
			done();
		});
	});

	it("should compile a complex file", done => {
		compile("./main1", {}, (stats, files) => {
			expect(Object.keys(files)).toEqual(["/main.js"]);
			const bundle = files["/main.js"];
			expect(bundle).toMatch("function __webpack_require__(");
			expect(bundle).toMatch("__webpack_require__(/*! ./a */");
			expect(bundle).toMatch("./main1.js");
			expect(bundle).toMatch("./a.js");
			expect(bundle).toMatch("./b.js");
			expect(bundle).toMatch("./node_modules/m1/a.js");
			expect(bundle).toMatch("This is a");
			expect(bundle).toMatch("This is b");
			expect(bundle).toMatch("This is m1/a");
			expect(bundle).not.toMatch("4: function(");
			expect(bundle).not.toMatch("window");
			expect(bundle).not.toMatch("jsonp");
			expect(bundle).not.toMatch("fixtures");
			done();
		});
	});

	it("should compile a file with transitive dependencies", done => {
		compile("./abc", {}, (stats, files) => {
			expect(Object.keys(files)).toEqual(["/main.js"]);
			const bundle = files["/main.js"];
			expect(bundle).toMatch("function __webpack_require__(");
			expect(bundle).toMatch("__webpack_require__(/*! ./a */");
			expect(bundle).toMatch("__webpack_require__(/*! ./b */");
			expect(bundle).toMatch("__webpack_require__(/*! ./c */");
			expect(bundle).toMatch("./abc.js");
			expect(bundle).toMatch("./a.js");
			expect(bundle).toMatch("./b.js");
			expect(bundle).toMatch("./c.js");
			expect(bundle).toMatch("This is a");
			expect(bundle).toMatch("This is b");
			expect(bundle).toMatch("This is c");
			expect(bundle).not.toMatch("4: function(");
			expect(bundle).not.toMatch("window");
			expect(bundle).not.toMatch("jsonp");
			expect(bundle).not.toMatch("fixtures");
			done();
		});
	});

	it("should compile a file with multiple chunks", done => {
		compile("./chunks", {}, (stats, files) => {
			expect(stats.chunks).toHaveLength(2);
			expect(Object.keys(files)).toEqual(["/main.js", "/394.js"]);
			const bundle = files["/main.js"];
			const chunk = files["/394.js"];
			expect(bundle).toMatch("function __webpack_require__(");
			expect(bundle).toMatch("__webpack_require__(/*! ./b */");
			expect(chunk).not.toMatch("__webpack_require__(/* ./b */");
			expect(bundle).toMatch("./chunks.js");
			expect(chunk).toMatch("./a.js");
			expect(chunk).toMatch("./b.js");
			expect(chunk).toMatch("This is a");
			expect(bundle).not.toMatch("This is a");
			expect(chunk).toMatch("This is b");
			expect(bundle).not.toMatch("This is b");
			expect(bundle).not.toMatch("4: function(");
			expect(bundle).not.toMatch("fixtures");
			expect(chunk).not.toMatch("fixtures");
			expect(bundle).toMatch("webpackJsonp");
			expect(chunk).toMatch('window["webpackJsonp"] || []).push');
			done();
		});
	});
	describe("methods", () => {
		let compiler;
		beforeEach(() => {
			compiler = webpack({
				entry: "./c",
				context: path.join(__dirname, "fixtures"),
				output: {
					path: "/",
					pathinfo: true
				}
			});
		});
		describe("purgeInputFileSystem", () => {
			it("invokes purge() if inputFileSystem.purge", done => {
				const mockPurge = jest.fn();
				compiler.inputFileSystem = {
					purge: mockPurge
				};
				compiler.purgeInputFileSystem();
				expect(mockPurge.mock.calls.length).toBe(1);
				done();
			});
			it("does NOT invoke purge() if !inputFileSystem.purge", done => {
				const mockPurge = jest.fn();
				compiler.inputFileSystem = null;
				compiler.purgeInputFileSystem();
				expect(mockPurge.mock.calls.length).toBe(0);
				done();
			});
		});
		describe("isChild", () => {
			it("returns booleanized this.parentCompilation", done => {
				compiler.parentCompilation = "stringyStringString";
				const response1 = compiler.isChild();
				expect(response1).toBe(true);

				compiler.parentCompilation = 123456789;
				const response2 = compiler.isChild();
				expect(response2).toBe(true);

				compiler.parentCompilation = {
					what: "I belong to an object"
				};
				const response3 = compiler.isChild();
				expect(response3).toBe(true);

				compiler.parentCompilation = ["Array", 123, true, null, [], () => {}];
				const response4 = compiler.isChild();
				expect(response4).toBe(true);

				compiler.parentCompilation = false;
				const response5 = compiler.isChild();
				expect(response5).toBe(false);

				compiler.parentCompilation = 0;
				const response6 = compiler.isChild();
				expect(response6).toBe(false);

				compiler.parentCompilation = null;
				const response7 = compiler.isChild();
				expect(response7).toBe(false);

				compiler.parentCompilation = "";
				const response8 = compiler.isChild();
				expect(response8).toBe(false);

				compiler.parentCompilation = NaN;
				const response9 = compiler.isChild();
				expect(response9).toBe(false);
				done();
			});
		});
	});
	it("should not emit on errors", done => {
		const compiler = webpack({
			context: __dirname,
			mode: "production",
			entry: "./missing",
			output: {
				path: "/",
				filename: "bundle.js"
			}
		});
		compiler.outputFileSystem = new MemoryFs();
		compiler.run((err, stats) => {
			if (err) return done(err);
			if (compiler.outputFileSystem.existsSync("/bundle.js"))
				return done(new Error("Bundle should not be created on error"));
			done();
		});
	});
	it("should bubble up errors when wrapped in a promise and bail is true", async done => {
		try {
			const createCompiler = options => {
				return new Promise((resolve, reject) => {
					const c = webpack(options);
					c.run((err, stats) => {
						if (err) {
							reject(err);
						}
						if (stats !== undefined && "errors" in stats) {
							reject(err);
						} else {
							resolve(stats);
						}
					});
				});
			};
			const compiler = await createCompiler({
				context: __dirname,
				mode: "production",
				entry: "./missing-file",
				output: {
					path: "/",
					filename: "bundle.js"
				},
				bail: true
			});
			done();
			return compiler;
		} catch (err) {
			expect(err.toString()).toMatch(
				"ModuleNotFoundError: Module not found: Error: Can't resolve './missing-file'"
			);
			done();
		}
	});
	it("should not emit compilation errors in async (watch)", async done => {
		try {
			const createCompiler = options => {
				return new Promise((resolve, reject) => {
					const c = webpack(options);
					c.outputFileSystem = new MemoryFs();
					const watching = c.watch({}, (err, stats) => {
						watching.close(() => {
							if (err) return reject(err);
							resolve(stats);
						});
					});
				});
			};
			const compiler = await createCompiler({
				context: __dirname,
				mode: "production",
				entry: "./missing-file",
				output: {
					path: "/",
					filename: "bundle.js"
				},
				watch: true
			});
			expect(compiler).toBeInstanceOf(Stats);
			done();
		} catch (err) {
			done(err);
		}
	});

	it("should not emit on errors (watch)", done => {
		const compiler = webpack({
			context: __dirname,
			mode: "production",
			entry: "./missing",
			output: {
				path: "/",
				filename: "bundle.js"
			}
		});
		compiler.outputFileSystem = new MemoryFs();
		const watching = compiler.watch({}, (err, stats) => {
			watching.close();
			if (err) return done(err);
			if (compiler.outputFileSystem.existsSync("/bundle.js"))
				return done(new Error("Bundle should not be created on error"));
			done();
		});
	});
	it("should not be run twice at a time (run)", function(done) {
		const compiler = webpack({
			context: __dirname,
			mode: "production",
			entry: "./c",
			output: {
				path: "/",
				filename: "bundle.js"
			}
		});
		compiler.outputFileSystem = new MemoryFs();
		compiler.run((err, stats) => {
			if (err) return done(err);
		});
		compiler.run((err, stats) => {
			if (err) return done();
		});
	});
	it("should not be run twice at a time (watch)", function(done) {
		const compiler = webpack({
			context: __dirname,
			mode: "production",
			entry: "./c",
			output: {
				path: "/",
				filename: "bundle.js"
			}
		});
		compiler.outputFileSystem = new MemoryFs();
		compiler.watch({}, (err, stats) => {
			if (err) return done(err);
		});
		compiler.watch({}, (err, stats) => {
			if (err) return done();
		});
	});
	it("should not be run twice at a time (run - watch)", function(done) {
		const compiler = webpack({
			context: __dirname,
			mode: "production",
			entry: "./c",
			output: {
				path: "/",
				filename: "bundle.js"
			}
		});
		compiler.outputFileSystem = new MemoryFs();
		compiler.run((err, stats) => {
			if (err) return done(err);
		});
		compiler.watch({}, (err, stats) => {
			if (err) return done();
		});
	});
	it("should not be run twice at a time (watch - run)", function(done) {
		const compiler = webpack({
			context: __dirname,
			mode: "production",
			entry: "./c",
			output: {
				path: "/",
				filename: "bundle.js"
			}
		});
		compiler.outputFileSystem = new MemoryFs();
		compiler.watch({}, (err, stats) => {
			if (err) return done(err);
		});
		compiler.run((err, stats) => {
			if (err) return done();
		});
	});
	it("should not be run twice at a time (instance cb)", function(done) {
		const compiler = webpack(
			{
				context: __dirname,
				mode: "production",
				entry: "./c",
				output: {
					path: "/",
					filename: "bundle.js"
				}
			},
			() => {}
		);
		compiler.outputFileSystem = new MemoryFs();
		compiler.run((err, stats) => {
			if (err) return done();
		});
	});
	it("should run again correctly after first compilation", function(done) {
		const compiler = webpack({
			context: __dirname,
			mode: "production",
			entry: "./c",
			output: {
				path: "/",
				filename: "bundle.js"
			}
		});
		compiler.outputFileSystem = new MemoryFs();
		compiler.run((err, stats) => {
			if (err) return done(err);

			compiler.run((err, stats) => {
				if (err) return done(err);
				done();
			});
		});
	});
	it("should watch again correctly after first compilation", function(done) {
		const compiler = webpack({
			context: __dirname,
			mode: "production",
			entry: "./c",
			output: {
				path: "/",
				filename: "bundle.js"
			}
		});
		compiler.outputFileSystem = new MemoryFs();
		compiler.run((err, stats) => {
			if (err) return done(err);

			compiler.watch({}, (err, stats) => {
				if (err) return done(err);
				done();
			});
		});
	});
	it("should run again correctly after first closed watch", function(done) {
		const compiler = webpack({
			context: __dirname,
			mode: "production",
			entry: "./c",
			output: {
				path: "/",
				filename: "bundle.js"
			}
		});
		compiler.outputFileSystem = new MemoryFs();
		const watching = compiler.watch({}, (err, stats) => {
			if (err) return done(err);
		});
		watching.close(() => {
			compiler.run((err, stats) => {
				if (err) return done(err);
				done();
			});
		});
	});
	it("should watch again correctly after first closed watch", function(done) {
		const compiler = webpack({
			context: __dirname,
			mode: "production",
			entry: "./c",
			output: {
				path: "/",
				filename: "bundle.js"
			}
		});
		compiler.outputFileSystem = new MemoryFs();
		const watching = compiler.watch({}, (err, stats) => {
			if (err) return done(err);
		});
		watching.close(() => {
			compiler.watch({}, (err, stats) => {
				if (err) return done(err);
				done();
			});
		});
	});
	it("should run again correctly inside afterDone hook", function(done) {
		const compiler = webpack({
			context: __dirname,
			mode: "production",
			entry: "./c",
			output: {
				path: "/",
				filename: "bundle.js"
			}
		});
		compiler.outputFileSystem = new MemoryFs();
		let once = true;
		compiler.hooks.afterDone.tap("RunAgainTest", () => {
			if (!once) return;
			once = false;
			compiler.run((err, stats) => {
				if (err) return done(err);
				done();
			});
		});
		compiler.run((err, stats) => {
			if (err) return done(err);
		});
	});
	it("should call afterDone hook after other callbacks (run)", function(done) {
		const compiler = webpack({
			context: __dirname,
			mode: "production",
			entry: "./c",
			output: {
				path: "/",
				filename: "bundle.js"
			}
		});
		compiler.outputFileSystem = new MemoryFs();
		const runCb = jest.fn();
		const doneHookCb = jest.fn();
		compiler.hooks.done.tap("afterDoneRunTest", doneHookCb);
		compiler.hooks.afterDone.tap("afterDoneRunTest", () => {
			expect(runCb).toHaveBeenCalled();
			expect(doneHookCb).toHaveBeenCalled();
			done();
		});
		compiler.run((err, stats) => {
			if (err) return done(err);
			runCb();
		});
	});
	it("should call afterDone hook after other callbacks (instance cb)", function(done) {
		const instanceCb = jest.fn();
		const compiler = webpack(
			{
				context: __dirname,
				mode: "production",
				entry: "./c",
				output: {
					path: "/",
					filename: "bundle.js"
				}
			},
			(err, stats) => {
				if (err) return done(err);
				instanceCb();
			}
		);
		compiler.outputFileSystem = new MemoryFs();
		const doneHookCb = jest.fn();
		compiler.hooks.done.tap("afterDoneRunTest", doneHookCb);
		compiler.hooks.afterDone.tap("afterDoneRunTest", () => {
			expect(instanceCb).toHaveBeenCalled();
			expect(doneHookCb).toHaveBeenCalled();
			done();
		});
	});
	it("should call afterDone hook after other callbacks (watch)", function(done) {
		const compiler = webpack({
			context: __dirname,
			mode: "production",
			entry: "./c",
			output: {
				path: "/",
				filename: "bundle.js"
			}
		});
		compiler.outputFileSystem = new MemoryFs();
		const doneHookCb = jest.fn();
		const watchCb = jest.fn();
		const invalidateCb = jest.fn();
		compiler.hooks.done.tap("afterDoneWatchTest", doneHookCb);
		compiler.hooks.afterDone.tap("afterDoneWatchTest", () => {
			expect(doneHookCb).toHaveBeenCalled();
			expect(watchCb).toHaveBeenCalled();
			expect(invalidateCb).toHaveBeenCalled();
			done();
		});
		const watch = compiler.watch({}, (err, stats) => {
			if (err) return done(err);
			watchCb();
		});
		watch.invalidate(invalidateCb);
	});
	it("should call afterDone hook after other callbacks (watch close)", function(done) {
		const compiler = webpack({
			context: __dirname,
			mode: "production",
			entry: "./c",
			output: {
				path: "/",
				filename: "bundle.js"
			}
		});
		compiler.outputFileSystem = new MemoryFs();
		const watchCloseCb = jest.fn();
		const watchCloseHookCb = jest.fn();
		const invalidateCb = jest.fn();
		compiler.hooks.watchClose.tap("afterDoneWatchTest", watchCloseHookCb);
		compiler.hooks.afterDone.tap("afterDoneWatchTest", () => {
			expect(watchCloseCb).toHaveBeenCalled();
			expect(watchCloseHookCb).toHaveBeenCalled();
			expect(invalidateCb).toHaveBeenCalled();
			done();
		});
		const watch = compiler.watch({}, (err, stats) => {
			if (err) return done(err);
			watch.close(watchCloseCb);
		});
		watch.invalidate(invalidateCb);
	});
	it("should flag watchMode as true in watch", function(done) {
		const compiler = webpack({
			context: __dirname,
			mode: "production",
			entry: "./c",
			output: {
				path: "/",
				filename: "bundle.js"
			}
		});

		compiler.outputFileSystem = new MemoryFs();

		const watch = compiler.watch({}, err => {
			if (err) return done(err);
			expect(compiler.watchMode).toBeTruthy();
			watch.close(() => {
				expect(compiler.watchMode).toBeFalsy();
				done();
			});
		});
	});
	it("should use cache on second run call", function(done) {
		const compiler = webpack({
			context: __dirname,
			mode: "development",
			devtool: false,
			entry: "./fixtures/count-loader!./fixtures/count-loader",
			output: {
				path: "/"
			}
		});
		compiler.outputFileSystem = new MemoryFs();
		compiler.run(() => {
			compiler.run(() => {
				const result = compiler.outputFileSystem.readFileSync(
					"/main.js",
					"utf-8"
				);
				expect(result).toContain("module.exports = 0;");
				done();
			});
		});
	});
	it("should call the failed-hook on error", done => {
		const failedSpy = jest.fn();
		const compiler = webpack({
			bail: true,
			context: __dirname,
			mode: "production",
			entry: "./missing",
			output: {
				path: "/",
				filename: "bundle.js"
			}
		});
		compiler.hooks.failed.tap("CompilerTest", failedSpy);
		compiler.outputFileSystem = new MemoryFs();
		compiler.run((err, stats) => {
			expect(err).toBeTruthy();
			expect(failedSpy).toHaveBeenCalledTimes(1);
			expect(failedSpy).toHaveBeenCalledWith(err);
			done();
		});
	});
});
